// src/app/api/cron/release-expired/route.ts
//
// Called by Vercel Cron every minute (see vercel.json).
// Finds all PENDING reservations past their expiresAt and releases them,
// returning the held units to available stock.
//
// Security: Vercel sets the Authorization header to Bearer <CRON_SECRET>
// on cron invocations. We validate this so arbitrary callers can't drain
// reservations. In dev, any request works if CRON_SECRET is unset.

import { NextRequest, NextResponse } from "next/server";
import { releaseExpiredReservations } from "@/lib/reservations";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const released = await releaseExpiredReservations();
  return NextResponse.json({ released, ts: new Date().toISOString() });
}
