// src/lib/schemas.ts
import { z } from "zod";

export const CreateReservationSchema = z.object({
  productId: z.string().min(1, "productId is required"),
  warehouseId: z.string().min(1, "warehouseId is required"),
  quantity: z
    .number()
    .int("quantity must be an integer")
    .min(1, "quantity must be at least 1")
    .max(50, "quantity cannot exceed 50 per reservation"),
});

export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;

// Shape of a reservation as returned by the API
export type ReservationResponse = {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  warehouseId: string;
  warehouseName: string;
  warehouseLocation: string;
  quantity: number;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  expiresAt: string; // ISO string
  createdAt: string;
};

// Shape of a product as returned by GET /api/products
export type ProductResponse = {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  stocks: {
    warehouseId: string;
    warehouseName: string;
    warehouseLocation: string;
    totalUnits: number;
    reservedUnits: number;
    available: number;
  }[];
};

export type WarehouseResponse = {
  id: string;
  name: string;
  location: string;
};
