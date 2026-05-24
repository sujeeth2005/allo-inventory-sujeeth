// src/app/api/reservations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { CreateReservationSchema } from "@/lib/schemas";
import { createReservation } from "@/lib/reservations";
import { checkIdempotency, storeIdempotency } from "@/lib/redis";
import { errorResponse } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // --- Idempotency (bonus) ---
    // If the client sends an Idempotency-Key header, we cache the response
    // so that retries return the original result without creating a second
    // reservation. We store the cached response in Redis for 24 hours.
    const idempotencyKey = req.headers.get("Idempotency-Key") ?? undefined;

    if (idempotencyKey) {
      const cached = await checkIdempotency(idempotencyKey, "reservations");
      if (cached !== null) {
        // Return the original response (status 200 for an already-created reservation)
        return NextResponse.json(
          typeof cached === "string" ? JSON.parse(cached) : cached,
          { status: 200, headers: { "Idempotent-Replayed": "true" } }
        );
      }
    }

    // --- Validate body ---
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = CreateReservationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { productId, warehouseId, quantity } = parsed.data;

    // --- Create reservation (concurrency-safe) ---
    const reservation = await createReservation(
      productId,
      warehouseId,
      quantity,
      idempotencyKey
    );

    // Cache for idempotency
    if (idempotencyKey) {
      await storeIdempotency(idempotencyKey, "reservations", reservation);
    }

    return NextResponse.json(reservation, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
