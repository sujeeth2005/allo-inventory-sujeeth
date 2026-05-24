// src/app/api/warehouses/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/errors";
import type { WarehouseResponse } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const warehouses = await prisma.warehouse.findMany({
      orderBy: { name: "asc" },
    });

    const response: WarehouseResponse[] = warehouses.map((w) => ({
      id: w.id,
      name: w.name,
      location: w.location,
    }));

    return NextResponse.json(response);
  } catch (err) {
    return errorResponse(err);
  }
}
