// src/app/page.tsx
// Server component — fetches products at request time (dynamic).
// Passes data to the client-side ProductList component which handles
// the Reserve interaction.

import { ProductList } from "@/components/ProductList";
import { prisma } from "@/lib/prisma";
import type { ProductResponse } from "@/lib/schemas";

export const dynamic = "force-dynamic";

async function getProducts(): Promise<ProductResponse[]> {
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: {
      stocks: {
        include: {
          warehouse: { select: { id: true, name: true, location: true } },
        },
      },
    },
  });

  return products.map((p) => ({
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
}

export default async function HomePage() {
  const products = await getProducts();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Products</h1>
        <p className="mt-1 text-sm text-gray-500">
          {products.length} products across {new Set(products.flatMap(p => p.stocks.map(s => s.warehouseId))).size} warehouses
        </p>
      </div>
      <ProductList initialProducts={products} />
    </div>
  );
}
