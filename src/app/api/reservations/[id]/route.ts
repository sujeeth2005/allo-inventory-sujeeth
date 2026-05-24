// src/app/api/reservations/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, ApiError } from "@/lib/errors";
import type { ReservationResponse } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const r = await prisma.reservation.findUnique({
      where: { id },
      include: {
        product: { select: { name: true, sku: true } },
        warehouse: { select: { name: true, location: true } },
      },
    });

    if (!r) throw new ApiError(404, "Reservation not found");

    const response: ReservationResponse = {
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

    return NextResponse.json(response);
  } catch (err) {
    return errorResponse(err);
  }
}
