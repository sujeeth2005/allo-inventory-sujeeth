// src/components/ReservationCountdown.tsx
"use client";

import { useState, useEffect } from "react";

export function ReservationCountdown({
  expiresAt,
  onExpired,
}: {
  expiresAt: string;
  onExpired?: () => void;
}) {
  const [remaining, setRemaining] = useState<number>(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now())
  );

  useEffect(() => {
    const tick = () => {
      const ms = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      setRemaining(ms);
      if (ms === 0) {
        clearInterval(interval);
        onExpired?.();
      }
    };

    const interval = setInterval(tick, 500);
    tick();
    return () => clearInterval(interval);
  }, [expiresAt, onExpired]);

  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const isUrgent = remaining < 60_000;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-lg font-bold tabular-nums ${
        remaining === 0
          ? "bg-red-100 text-red-800"
          : isUrgent
          ? "bg-amber-100 text-amber-800"
          : "bg-indigo-50 text-indigo-800"
      }`}
    >
      <span>{remaining === 0 ? "Expired" : `${minutes}:${String(seconds).padStart(2, "0")}`}</span>
    </div>
  );
}
