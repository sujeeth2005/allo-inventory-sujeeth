// src/lib/reservations.ts
//
// This module owns all mutation logic for reservations.
// It is the only place that touches Stock.reservedUnits.
//
// === Concurrency strategy ===
//
// The invariant we must maintain:
//   Stock.reservedUnits + new_quantity <= Stock.totalUnits
//
// Naive approach (read available → check → write) has a TOCTOU race:
// two concurrent requests can both read "1 unit available", both pass
// the check, and both write +1, leaving reservedUnits > totalUnits.
//
// Our approach: run the check and the increment as a single atomic
// UPDATE inside a Postgres transaction, using SELECT ... FOR UPDATE
// to acquire an exclusive row lock before reading.
//
//   BEGIN;
//   SELECT * FROM "Stock" ... FOR UPDATE;   ← blocks other writers on this row
//   -- check available units in application code
//   UPDATE "Stock" SET reservedUnits = reservedUnits + qty ...;
//   INSERT INTO "Reservation" ...;
//   COMMIT;
//
// The FOR UPDATE lock means concurrent reservation attempts for the same
// product/warehouse will queue up. Exactly one will succeed or fail based
// on the true current count, not a stale snapshot.
//
// Alternative considered: optimistic locking (version column + retry).
// Rejected because under sustained contention it degrades to many retries,
// whereas pessimistic locking is predictably linear.

import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/errors";
import type { ReservationResponse } from "@/lib/schemas";

const RESERVATION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function formatReservation(r: {
  id: string;
  productId: string;
  product: { name: string; sku: string };
  warehouseId: string;
  warehouse: { name: string; location: string };
  quantity: number;
  status: string;
  expiresAt: Date;
  createdAt: Date;
}): ReservationResponse {
  return {
    id: r.id,
    productId: r.productId,
    productName: r.product.name,
    productSku: r.product.sku,
    warehouseId: r.warehouseId,
    warehouseName: r.warehouse.name,
    warehouseLocation: r.warehouse.location,
    quantity: r.quantity,
    status: r.status as ReservationResponse["status"],
    expiresAt: r.expiresAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  };
}

export async function createReservation(
  productId: string,
  warehouseId: string,
  quantity: number,
  idempotencyKey?: string
): Promise<ReservationResponse> {
  // Validate that product and warehouse exist
  const [product, warehouse] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId } }),
    prisma.warehouse.findUnique({ where: { id: warehouseId } }),
  ]);
  if (!product) throw new ApiError(404, "Product not found");
  if (!warehouse) throw new ApiError(404, "Warehouse not found");

  const reservation = await prisma.$transaction(async (tx) => {
    // --- Acquire exclusive row lock on this stock entry ---
    // This blocks any concurrent transaction trying to reserve from the same
    // product/warehouse until we commit or roll back.
    const stocks = await tx.$queryRaw<
      { id: string; totalUnits: number; reservedUnits: number }[]
    >`
      SELECT id, "totalUnits", "reservedUnits"
      FROM "Stock"
      WHERE "productId" = ${productId}
        AND "warehouseId" = ${warehouseId}
      FOR UPDATE
    `;

    const stock = stocks[0];
    if (!stock) {
      throw new ApiError(
        404,
        "No stock record found for this product/warehouse combination"
      );
    }

    const available = stock.totalUnits - stock.reservedUnits;
    if (available < quantity) {
      throw new ApiError(
        409,
        `Insufficient stock: requested ${quantity}, available ${available}`
      );
    }

    // --- Increment the reserved counter ---
    await tx.$executeRaw`
      UPDATE "Stock"
      SET "reservedUnits" = "reservedUnits" + ${quantity}
      WHERE id = ${stock.id}
    `;

    // --- Create the reservation record ---
    return tx.reservation.create({
      data: {
        productId,
        warehouseId,
        quantity,
        status: "PENDING",
        expiresAt: new Date(Date.now() + RESERVATION_WINDOW_MS),
        idempotencyKey: idempotencyKey ?? null,
      },
      include: {
        product: { select: { name: true, sku: true } },
        warehouse: { select: { name: true, location: true } },
      },
    });
  });

  return formatReservation(reservation);
}

export async function confirmReservation(
  id: string
): Promise<ReservationResponse> {
  const reservation = await prisma.$transaction(async (tx) => {
    // Lock the reservation row to prevent concurrent confirm/release
    const rows = await tx.$queryRaw<
      {
        id: string;
        status: string;
        expiresAt: Date;
        productId: string;
        warehouseId: string;
        quantity: number;
      }[]
    >`
      SELECT id, status, "expiresAt", "productId", "warehouseId", quantity
      FROM "Reservation"
      WHERE id = ${id}
      FOR UPDATE
    `;

    const r = rows[0];
    if (!r) throw new ApiError(404, "Reservation not found");

    if (r.status === "CONFIRMED") {
      // Already confirmed — idempotent success
      return tx.reservation.findUniqueOrThrow({
        where: { id },
        include: {
          product: { select: { name: true, sku: true } },
          warehouse: { select: { name: true, location: true } },
        },
      });
    }

    if (r.status === "RELEASED") {
      throw new ApiError(409, "Reservation has already been released");
    }

    // PENDING — check expiry
    if (r.expiresAt < new Date()) {
      // Release the held stock before returning 410
      await tx.$executeRaw`
        UPDATE "Stock"
        SET "reservedUnits" = GREATEST("reservedUnits" - ${r.quantity}, 0)
        WHERE "productId" = ${r.productId}
          AND "warehouseId" = ${r.warehouseId}
      `;
      await tx.reservation.update({
        where: { id },
        data: { status: "RELEASED" },
      });
      throw new ApiError(410, "Reservation has expired");
    }

    // All good — confirm: decrement totalUnits (sale is final) and reservedUnits
    await tx.$executeRaw`
      UPDATE "Stock"
      SET
        "totalUnits"    = GREATEST("totalUnits"    - ${r.quantity}, 0),
        "reservedUnits" = GREATEST("reservedUnits" - ${r.quantity}, 0)
      WHERE "productId" = ${r.productId}
        AND "warehouseId" = ${r.warehouseId}
    `;

    return tx.reservation.update({
      where: { id },
      data: { status: "CONFIRMED" },
      include: {
        product: { select: { name: true, sku: true } },
        warehouse: { select: { name: true, location: true } },
      },
    });
  });

  return formatReservation(reservation);
}

export async function releaseReservation(
  id: string
): Promise<ReservationResponse> {
  const reservation = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      {
        id: string;
        status: string;
        productId: string;
        warehouseId: string;
        quantity: number;
      }[]
    >`
      SELECT id, status, "productId", "warehouseId", quantity
      FROM "Reservation"
      WHERE id = ${id}
      FOR UPDATE
    `;

    const r = rows[0];
    if (!r) throw new ApiError(404, "Reservation not found");

    if (r.status === "RELEASED") {
      // Already released — idempotent
      return tx.reservation.findUniqueOrThrow({
        where: { id },
        include: {
          product: { select: { name: true, sku: true } },
          warehouse: { select: { name: true, location: true } },
        },
      });
    }

    if (r.status === "CONFIRMED") {
      throw new ApiError(409, "Cannot release a confirmed reservation");
    }

    // PENDING — release the hold
    await tx.$executeRaw`
      UPDATE "Stock"
      SET "reservedUnits" = GREATEST("reservedUnits" - ${r.quantity}, 0)
      WHERE "productId" = ${r.productId}
        AND "warehouseId" = ${r.warehouseId}
    `;

    return tx.reservation.update({
      where: { id },
      data: { status: "RELEASED" },
      include: {
        product: { select: { name: true, sku: true } },
        warehouse: { select: { name: true, location: true } },
      },
    });
  });

  return formatReservation(reservation);
}

/**
 * Release all PENDING reservations whose expiresAt has passed.
 * Called by the cron endpoint. Safe to call concurrently — the FOR UPDATE
 * inside releaseReservation prevents double-releases.
 */
export async function releaseExpiredReservations(): Promise<number> {
  const expired = await prisma.reservation.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: new Date() },
    },
    select: { id: true },
  });

  let released = 0;
  for (const { id } of expired) {
    try {
      await releaseReservation(id);
      released++;
    } catch {
      // May have been released concurrently — that's fine
    }
  }
  return released;
}
