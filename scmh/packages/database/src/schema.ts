import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
  deletedBy: text("deleted_by")
};

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  canonicalName: text("canonical_name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  categoryId: text("category_id"),
  unit: text("unit").notNull(),
  brand: text("brand"),
  manufacturer: text("manufacturer"),
  technicalDescription: text("technical_description"),
  specification: text("specification"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  ...timestamps
}, (t) => [
  uniqueIndex("products_code_uq").on(t.code),
  index("products_normalized_name_idx").on(t.normalizedName),
  index("products_status_idx").on(t.status)
]);

export const productAliases = sqliteTable("product_aliases", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  alias: text("alias").notNull(),
  normalizedAlias: text("normalized_alias").notNull(),
  createdAt: text("created_at").notNull()
}, (t) => [
  index("product_aliases_product_idx").on(t.productId),
  index("product_aliases_normalized_idx").on(t.normalizedAlias)
]);

export const suppliers = sqliteTable("suppliers", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  canonicalName: text("canonical_name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  taxCode: text("tax_code"),
  address: text("address"),
  contact: text("contact"),
  phone: text("phone"),
  email: text("email"),
  bank: text("bank"),
  bankAccount: text("bank_account"),
  accountHolder: text("account_holder"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  ...timestamps
}, (t) => [
  uniqueIndex("suppliers_code_uq").on(t.code),
  uniqueIndex("suppliers_tax_code_uq").on(t.taxCode),
  index("suppliers_normalized_name_idx").on(t.normalizedName),
  index("suppliers_status_idx").on(t.status)
]);

export const supplierAliases = sqliteTable("supplier_aliases", {
  id: text("id").primaryKey(),
  supplierId: text("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
  alias: text("alias").notNull(),
  normalizedAlias: text("normalized_alias").notNull(),
  createdAt: text("created_at").notNull()
}, (t) => [
  index("supplier_aliases_supplier_idx").on(t.supplierId),
  index("supplier_aliases_normalized_idx").on(t.normalizedAlias)
]);

export const purchaseHistory = sqliteTable("purchase_history", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => products.id),
  supplierId: text("supplier_id").notNull().references(() => suppliers.id),
  purchasedAt: text("purchased_at").notNull(),
  poNumber: text("po_number"),
  quantityMicros: integer("quantity_micros").notNull(),
  unitPriceVnd: integer("unit_price_vnd").notNull(),
  vatBps: integer("vat_bps").notNull().default(0),
  totalVnd: integer("total_vnd").notNull(),
  sourceFingerprint: text("source_fingerprint"),
  createdAt: text("created_at").notNull()
}, (t) => [
  index("purchase_history_product_date_idx").on(t.productId, t.purchasedAt),
  index("purchase_history_supplier_date_idx").on(t.supplierId, t.purchasedAt),
  uniqueIndex("purchase_history_source_fingerprint_uq").on(t.sourceFingerprint)
]);

export const normalizationMatches = sqliteTable("normalization_matches", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  rawValue: text("raw_value").notNull(),
  normalizedValue: text("normalized_value").notNull(),
  matchedEntityId: text("matched_entity_id"),
  confidenceBps: integer("confidence_bps").notNull().default(0),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at")
}, (t) => [
  index("normalization_matches_lookup_idx").on(t.entityType, t.normalizedValue, t.status)
]);
