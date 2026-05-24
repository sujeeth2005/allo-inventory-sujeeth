// src/app/api/reservations/[id]/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { confirmReservation } from "@/lib/reservations";
import { checkIdempotency, storeIdempotency } from "@/lib/redis";
import { errorResponse } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Idempotency for confirm
    const idempotencyKey = req.headers.get("Idempotency-Key") ?? undefined;
    if (idempotencyKey) {
      const cached = await checkIdempotency(idempotencyKey, `confirm:${id}`);
      if (cached !== null) {
        return NextResponse.json(
          typeof cached === "string" ? JSON.parse(cached) : cached,
          { headers: { "Idempotent-Replayed": "true" } }
        );
      }
    }

    const reservation = await confirmReservation(id);

    if (idempotencyKey) {
      await storeIdempotency(idempotencyKey, `confirm:${id}`, reservation);
    }

    return NextResponse.json(reservation);
  } catch (err) {
    return errorResponse(err);
  }
}
