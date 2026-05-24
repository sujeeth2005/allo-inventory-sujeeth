// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database…");

  // Clean up in dependency order
  await prisma.reservation.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  // Warehouses
  const [london, manchester, edinburgh] = await Promise.all([
    prisma.warehouse.create({
      data: { name: "London Fulfilment Centre", location: "London, UK" },
    }),
    prisma.warehouse.create({
      data: { name: "Manchester Hub", location: "Manchester, UK" },
    }),
    prisma.warehouse.create({
      data: { name: "Edinburgh Store", location: "Edinburgh, UK" },
    }),
  ]);

  // Products
  const [airMax, ultraBoost, classicLeather, blazer, forum] =
    await Promise.all([
      prisma.product.create({
        data: {
          name: "Air Max 97 OG",
          sku: "AIRMAX97-OG",
          description:
            "Full-length visible Air cushioning, heritage colourway.",
          price: 180,
          imageUrl: "https://placehold.co/400x300/1a1a1a/ffffff?text=Air+Max+97",
        },
      }),
      prisma.product.create({
        data: {
          name: "Ultraboost 22",
          sku: "UBOOST22",
          description: "Responsive Boost midsole, Primeknit upper.",
          price: 195,
          imageUrl:
            "https://placehold.co/400x300/1a1a1a/ffffff?text=Ultraboost+22",
        },
      }),
      prisma.product.create({
        data: {
          name: "Classic Leather Sneaker",
          sku: "CL-LEATHER-01",
          description: "Timeless full-grain leather, cushioned sockliner.",
          price: 120,
          imageUrl:
            "https://placehold.co/400x300/1a1a1a/ffffff?text=Classic+Leather",
        },
      }),
      prisma.product.create({
        data: {
          name: "Blazer Mid '77",
          sku: "BLAZER-MID-77",
          description: "Vintage high-top silhouette, foam midsole.",
          price: 105,
          imageUrl:
            "https://placehold.co/400x300/1a1a1a/ffffff?text=Blazer+Mid",
        },
      }),
      prisma.product.create({
        data: {
          name: "Forum 84 Low",
          sku: "FORUM84-LOW",
          description: "Retro basketball icon, leather upper, ankle strap.",
          price: 110,
          imageUrl:
            "https://placehold.co/400x300/1a1a1a/ffffff?text=Forum+84",
        },
      }),
    ]);

  // Stock — intentionally low counts on some to make the race-condition demo easy
  await prisma.stock.createMany({
    data: [
      // Air Max 97 — only 1 unit in London to demo the race condition
      { productId: airMax.id, warehouseId: london.id, totalUnits: 1, reservedUnits: 0 },
      { productId: airMax.id, warehouseId: manchester.id, totalUnits: 5, reservedUnits: 0 },
      { productId: airMax.id, warehouseId: edinburgh.id, totalUnits: 3, reservedUnits: 0 },

      // Ultraboost
      { productId: ultraBoost.id, warehouseId: london.id, totalUnits: 8, reservedUnits: 0 },
      { productId: ultraBoost.id, warehouseId: manchester.id, totalUnits: 2, reservedUnits: 0 },

      // Classic Leather
      { productId: classicLeather.id, warehouseId: london.id, totalUnits: 12, reservedUnits: 0 },
      { productId: classicLeather.id, warehouseId: edinburgh.id, totalUnits: 4, reservedUnits: 0 },

      // Blazer Mid — 1 unit in Manchester, great for demo
      { productId: blazer.id, warehouseId: manchester.id, totalUnits: 1, reservedUnits: 0 },
      { productId: blazer.id, warehouseId: london.id, totalUnits: 6, reservedUnits: 0 },

      // Forum 84
      { productId: forum.id, warehouseId: london.id, totalUnits: 9, reservedUnits: 0 },
      { productId: forum.id, warehouseId: edinburgh.id, totalUnits: 3, reservedUnits: 0 },
    ],
  });

  console.log("Seed complete.");
  console.log(`  ${5} products`);
  console.log(`  ${3} warehouses`);
  console.log(`  ${11} stock entries`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
