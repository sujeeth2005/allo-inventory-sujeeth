// src/app/api/reservations/[id]/release/route.ts
import { NextRequest, NextResponse } from "next/server";
import { releaseReservation } from "@/lib/reservations";
import { errorResponse } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const reservation = await releaseReservation(id);
    return NextResponse.json(reservation);
  } catch (err) {
    return errorResponse(err);
  }
}
