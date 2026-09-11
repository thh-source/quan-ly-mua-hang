PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  category_id TEXT,
  unit TEXT NOT NULL,
  brand TEXT,
  manufacturer TEXT,
  technical_description TEXT,
  specification TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked')),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by TEXT
);
CREATE INDEX IF NOT EXISTS products_normalized_name_idx ON products(normalized_name);
CREATE INDEX IF NOT EXISTS products_status_idx ON products(status);

CREATE TABLE IF NOT EXISTS product_aliases (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS product_aliases_product_idx ON product_aliases(product_id);
CREATE INDEX IF NOT EXISTS product_aliases_normalized_idx ON product_aliases(normalized_alias);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  tax_code TEXT UNIQUE,
  address TEXT,
  contact TEXT,
  phone TEXT,
  email TEXT,
  bank TEXT,
  bank_account TEXT,
  account_holder TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked')),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by TEXT
);
CREATE INDEX IF NOT EXISTS suppliers_normalized_name_idx ON suppliers(normalized_name);
CREATE INDEX IF NOT EXISTS suppliers_status_idx ON suppliers(status);

CREATE TABLE IF NOT EXISTS supplier_aliases (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS supplier_aliases_supplier_idx ON supplier_aliases(supplier_id);
CREATE INDEX IF NOT EXISTS supplier_aliases_normalized_idx ON supplier_aliases(normalized_alias);

CREATE TABLE IF NOT EXISTS purchase_history (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  purchased_at TEXT NOT NULL,
  po_number TEXT,
  quantity_micros INTEGER NOT NULL CHECK(quantity_micros > 0),
  unit_price_vnd INTEGER NOT NULL CHECK(unit_price_vnd >= 0),
  vat_bps INTEGER NOT NULL DEFAULT 0 CHECK(vat_bps BETWEEN 0 AND 10000),
  total_vnd INTEGER NOT NULL CHECK(total_vnd >= 0),
  source_fingerprint TEXT UNIQUE,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS purchase_history_product_date_idx ON purchase_history(product_id, purchased_at);
CREATE INDEX IF NOT EXISTS purchase_history_supplier_date_idx ON purchase_history(supplier_id, purchased_at);

CREATE TABLE IF NOT EXISTS normalization_matches (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('product','supplier')),
  raw_value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  matched_entity_id TEXT,
  confidence_bps INTEGER NOT NULL DEFAULT 0 CHECK(confidence_bps BETWEEN 0 AND 10000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','matched','rejected')),
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS normalization_matches_lookup_idx
  ON normalization_matches(entity_type, normalized_value, status);
