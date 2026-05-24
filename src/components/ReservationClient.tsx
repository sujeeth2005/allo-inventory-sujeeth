// src/components/ReservationClient.tsx
"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { ReservationCountdown } from "@/components/ReservationCountdown";
import type { ReservationResponse } from "@/lib/schemas";

function StatusBadge({ status }: { status: ReservationResponse["status"] }) {
  const styles = {
    PENDING: "bg-amber-100 text-amber-800",
    CONFIRMED: "bg-green-100 text-green-800",
    RELEASED: "bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export function ReservationClient({
  initialReservation,
}: {
  initialReservation: ReservationResponse;
}) {
  const [reservation, setReservation] =
    useState<ReservationResponse>(initialReservation);
  const [loading, setLoading] = useState<"confirm" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExpired = useCallback(() => {
    // Timer hit zero — update local state to show expired
    setReservation((r) => ({ ...r, status: "RELEASED" }));
  }, []);

  async function handleConfirm() {
    setLoading("confirm");
    setError(null);

    try {
      const res = await fetch(`/api/reservations/${reservation.id}/confirm`, {
        method: "POST",
      });

      const data: ReservationResponse & { error?: string } = await res.json();

      if (res.status === 410) {
        setError("Your reservation expired before payment could be confirmed.");
        setReservation((r) => ({ ...r, status: "RELEASED" }));
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }

      setReservation(data);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  async function handleCancel() {
    setLoading("cancel");
    setError(null);

    try {
      const res = await fetch(`/api/reservations/${reservation.id}/release`, {
        method: "POST",
      });

      const data: ReservationResponse & { error?: string } = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }

      setReservation(data);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  const isPending = reservation.status === "PENDING";
  const isConfirmed = reservation.status === "CONFIRMED";
  const isReleased = reservation.status === "RELEASED";

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <Link
          href="/"
          className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
        >
          ← Back to products
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-100 bg-gray-50 px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="font-semibold text-gray-900">
              {isConfirmed ? "Order confirmed" : isReleased ? "Reservation ended" : "Complete your purchase"}
            </h1>
            <StatusBadge status={reservation.status} />
          </div>
          <p className="text-xs text-gray-400 mt-1 font-mono">{reservation.id}</p>
        </div>

        {/* Order summary */}
        <div className="px-6 py-5 space-y-4">
          <div className="rounded-lg bg-gray-50 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Product</span>
              <span className="font-medium text-gray-900">
                {reservation.productName}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">SKU</span>
              <span className="font-mono text-gray-700">
                {reservation.productSku}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Warehouse</span>
              <span className="text-gray-700">{reservation.warehouseName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Quantity</span>
              <span className="font-medium text-gray-900">
                {reservation.quantity}
              </span>
            </div>
          </div>

          {/* Timer — only show for pending reservations */}
          {isPending && (
            <div className="flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-indigo-900">
                  Reservation held for
                </p>
                <p className="text-xs text-indigo-600 mt-0.5">
                  Complete payment before this expires
                </p>
              </div>
              <ReservationCountdown
                expiresAt={reservation.expiresAt}
                onExpired={handleExpired}
              />
            </div>
          )}

          {/* Status messages */}
          {isConfirmed && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-4">
              <p className="text-sm font-medium text-green-800">
                🎉 Purchase confirmed! Your order is being processed.
              </p>
            </div>
          )}

          {isReleased && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
              <p className="text-sm text-gray-700">
                This reservation has ended. The stock has been returned to the
                pool.
              </p>
              <Link
                href="/"
                className="mt-2 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-800"
              >
                Browse products again →
              </Link>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4">
              <p className="text-sm font-semibold text-red-800 mb-0.5">
                {error.includes("expired") ? "Reservation expired" : "Error"}
              </p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* CTA buttons — only for pending */}
          {isPending && (
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCancel}
                disabled={loading !== null}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading === "cancel" ? "Cancelling…" : "Cancel"}
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading !== null}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading === "confirm" ? "Confirming…" : "Confirm purchase"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
