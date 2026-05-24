// src/app/reservation/[id]/page.tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ReservationClient } from "@/components/ReservationClient";
import type { ReservationResponse } from "@/lib/schemas";

export const dynamic = "force-dynamic";

async function getReservation(id: string): Promise<ReservationResponse | null> {
  const r = await prisma.reservation.findUnique({
    where: { id },
    include: {
      product: { select: { name: true, sku: true } },
      warehouse: { select: { name: true, location: true } },
    },
  });

  if (!r) return null;

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

export default async function ReservationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const reservation = await getReservation(id);

  if (!reservation) notFound();

  return <ReservationClient initialReservation={reservation} />;
}
