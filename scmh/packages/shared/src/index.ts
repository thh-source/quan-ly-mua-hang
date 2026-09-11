import { z } from "zod";

export const statusSchema = z.enum(["active", "locked"]);

export const productInputSchema = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  canonicalName: z.string().trim().min(1).max(255),
  categoryId: z.string().trim().optional().nullable(),
  unit: z.string().trim().min(1).max(64),
  brand: z.string().trim().max(128).optional().nullable(),
  manufacturer: z.string().trim().max(255).optional().nullable(),
  technicalDescription: z.string().trim().optional().nullable(),
  specification: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  status: statusSchema.default("active"),
  aliases: z.array(z.string().trim().min(1).max(255)).default([])
});

export const supplierInputSchema = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  canonicalName: z.string().trim().min(1).max(255),
  taxCode: z.string().trim().max(64).optional().nullable(),
  address: z.string().trim().optional().nullable(),
  contact: z.string().trim().max(255).optional().nullable(),
  phone: z.string().trim().max(64).optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  bank: z.string().trim().max(255).optional().nullable(),
  bankAccount: z.string().trim().max(128).optional().nullable(),
  accountHolder: z.string().trim().max(255).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  status: statusSchema.default("active"),
  aliases: z.array(z.string().trim().min(1).max(255)).default([])
});

export const purchaseHistoryInputSchema = z.object({
  productId: z.string().min(1),
  supplierId: z.string().min(1),
  purchasedAt: z.string().datetime(),
  poNumber: z.string().trim().max(128).optional().nullable(),
  quantityMicros: z.number().int().positive(),
  unitPriceVnd: z.number().int().nonnegative(),
  vatBps: z.number().int().min(0).max(10000).default(0),
  totalVnd: z.number().int().nonnegative()
});

export const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(cong ty|cty|co\.?|company|tnhh|cp|jsc|ltd)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
