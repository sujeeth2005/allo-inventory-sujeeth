// src/app/api/products/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/errors";
import type { ProductResponse } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      orderBy: { name: "asc" },
      include: {
        stocks: {
          include: {
            warehouse: {
              select: { id: true, name: true, location: true },
            },
          },
        },
      },
    });

    const response: ProductResponse[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      description: p.description,
      price: p.price,
      imageUrl: p.imageUrl,
      stocks: p.stocks.map((s) => ({
        warehouseId: s.warehouse.id,
        warehouseName: s.warehouse.name,
        warehouseLocation: s.warehouse.location,
        totalUnits: s.totalUnits,
        reservedUnits: s.reservedUnits,
        available: s.totalUnits - s.reservedUnits,
      })),
    }));

    return NextResponse.json(response);
  } catch (err) {
    return errorResponse(err);
  }
}
