// src/components/ProductList.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductResponse } from "@/lib/schemas";

type StockEntry = ProductResponse["stocks"][number];

function StockBadge({ available }: { available: number }) {
  if (available === 0)
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        Out of stock
      </span>
    );
  if (available <= 3)
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
        Only {available} left
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
      {available} available
    </span>
  );
}

function ReserveModal({
  product,
  onClose,
}: {
  product: ProductResponse;
  onClose: () => void;
}) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(
    product.stocks.find((s) => s.available > 0)?.warehouseId ?? ""
  );
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedStock: StockEntry | undefined = product.stocks.find(
    (s) => s.warehouseId === warehouseId
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, warehouseId, quantity }),
      });

      const data = await res.json();

      if (res.status === 409) {
        setError(data.error ?? "Not enough stock available.");
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }

      // Navigate to the reservation checkout page
      router.push(`/reservation/${data.id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Reserve {product.name}
            </h2>
            <p className="text-sm text-gray-500">{product.sku}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Warehouse
            </label>
            <select
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                setQuantity(1);
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Select warehouse…</option>
              {product.stocks.map((s) => (
                <option
                  key={s.warehouseId}
                  value={s.warehouseId}
                  disabled={s.available === 0}
                >
                  {s.warehouseName} — {s.available} available
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantity
            </label>
            <input
              type="number"
              min={1}
              max={selectedStock?.available ?? 1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {selectedStock && (
              <p className="mt-1 text-xs text-gray-500">
                Max {selectedStock.available} units
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !warehouseId || quantity < 1}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Reserving…" : "Reserve now"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProductCard({
  product,
  onReserve,
}: {
  product: ProductResponse;
  onReserve: (p: ProductResponse) => void;
}) {
  const totalAvailable = product.stocks.reduce((s, x) => s + x.available, 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
      <div className="bg-gray-100 h-48 flex items-center justify-center">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-gray-400 text-sm">No image</span>
        )}
      </div>

      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-gray-900">{product.name}</h3>
          <span className="text-sm font-semibold text-gray-900 shrink-0">
            £{product.price.toFixed(2)}
          </span>
        </div>
        <p className="text-xs text-gray-500 mb-3">{product.sku}</p>

        {product.description && (
          <p className="text-sm text-gray-600 mb-4 line-clamp-2">
            {product.description}
          </p>
        )}

        <div className="space-y-1.5 mb-4">
          {product.stocks.map((s) => (
            <div
              key={s.warehouseId}
              className="flex items-center justify-between text-xs"
            >
              <span className="text-gray-500 truncate mr-2">
                {s.warehouseName}
              </span>
              <StockBadge available={s.available} />
            </div>
          ))}
        </div>

        <div className="mt-auto">
          <button
            onClick={() => onReserve(product)}
            disabled={totalAvailable === 0}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {totalAvailable === 0 ? "Out of stock" : "Reserve"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProductList({
  initialProducts,
}: {
  initialProducts: ProductResponse[];
}) {
  const [products] = useState(initialProducts);
  const [reservingProduct, setReservingProduct] =
    useState<ProductResponse | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            onReserve={setReservingProduct}
          />
        ))}
      </div>

      {reservingProduct && (
        <ReserveModal
          product={reservingProduct}
          onClose={() => setReservingProduct(null)}
        />
      )}
    </>
  );
}
