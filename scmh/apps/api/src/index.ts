import { Hono } from "hono";
import { cors } from "hono/cors";
import { drizzle } from "drizzle-orm/d1";
import { products, productAliases, suppliers, supplierAliases, purchaseHistory, normalizationMatches } from "@scmh/database";
import { normalizeText, productInputSchema, supplierInputSchema, purchaseHistoryInputSchema } from "@scmh/shared";
import { and, desc, eq, like, or, sql } from "drizzle-orm";

type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  ENVIRONMENT: string;
};

const app = new Hono<{ Bindings: Bindings }>();
app.use("/api/*", cors({ origin: "*", allowMethods: ["GET","POST","PUT","DELETE","OPTIONS"] }));

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const ok = <T>(data: T) => ({ data });
const fail = (code: string, message: string) => ({ error: { code, message } });

app.get("/api/v1/health", (c) => c.json(ok({ status: "ok", environment: c.env.ENVIRONMENT })));

app.get("/api/v1/products", async (c) => {
  const db = drizzle(c.env.DB);
  const q = (c.req.query("q") ?? "").trim();
  const status = c.req.query("status");
  const filters = [sql`${products.deletedAt} is null`];
  if (q) filters.push(or(like(products.name, `%${q}%`), like(products.code, `%${q}%`), like(products.normalizedName, `%${normalizeText(q)}%`))!);
  if (status) filters.push(eq(products.status, status));
  const rows = await db.select().from(products).where(and(...filters)).orderBy(products.name).limit(100);
  return c.json(ok(rows));
});

app.post("/api/v1/products", async (c) => {
  const parsed = productInputSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Dữ liệu hàng hóa không hợp lệ."), 400);
  const db = drizzle(c.env.DB);
  const value = parsed.data;
  const productId = id();
  const ts = now();
  try {
    const statements: D1PreparedStatement[] = [
      c.env.DB.prepare(`
        INSERT INTO products (
          id, code, name, canonical_name, normalized_name, category_id, unit, brand,
          manufacturer, technical_description, specification, status, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        productId, value.code, value.name, value.canonicalName, normalizeText(value.canonicalName),
        value.categoryId ?? null, value.unit, value.brand ?? null, value.manufacturer ?? null,
        value.technicalDescription ?? null, value.specification ?? null, value.status,
        value.notes ?? null, ts, ts
      )
    ];
    for (const alias of value.aliases) {
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO product_aliases (id, product_id, alias, normalized_alias, created_at) VALUES (?, ?, ?, ?, ?)"
        ).bind(id(), productId, alias, normalizeText(alias), ts)
      );
    }
    await c.env.DB.batch(statements);
    return c.json(ok({ id: productId }), 201);
  } catch {
    return c.json(fail("PRODUCT_CONFLICT", "Mã hàng hóa đã tồn tại hoặc dữ liệu bị trùng."), 409);
  }
});

app.put("/api/v1/products/:id", async (c) => {
  const parsed = productInputSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Dữ liệu hàng hóa không hợp lệ."), 400);
  const db = drizzle(c.env.DB);
  const value = parsed.data;
  const productId = c.req.param("id");
  const ts = now();
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(`
      UPDATE products SET
        code = ?, name = ?, canonical_name = ?, normalized_name = ?, category_id = ?, unit = ?,
        brand = ?, manufacturer = ?, technical_description = ?, specification = ?, status = ?,
        notes = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).bind(
      value.code, value.name, value.canonicalName, normalizeText(value.canonicalName),
      value.categoryId ?? null, value.unit, value.brand ?? null, value.manufacturer ?? null,
      value.technicalDescription ?? null, value.specification ?? null, value.status,
      value.notes ?? null, ts, productId
    ),
    c.env.DB.prepare("DELETE FROM product_aliases WHERE product_id = ?").bind(productId)
  ];
  for (const alias of value.aliases) {
    statements.push(
      c.env.DB.prepare(
        "INSERT INTO product_aliases (id, product_id, alias, normalized_alias, created_at) VALUES (?, ?, ?, ?, ?)"
      ).bind(id(), productId, alias, normalizeText(alias), ts)
    );
  }
  await c.env.DB.batch(statements);
  return c.json(ok({ id: productId }));
});

app.delete("/api/v1/products/:id", async (c) => {
  const db = drizzle(c.env.DB);
  await db.update(products).set({ deletedAt: now(), updatedAt: now() }).where(eq(products.id, c.req.param("id")));
  return c.json(ok({ deleted: true }));
});

app.get("/api/v1/suppliers", async (c) => {
  const db = drizzle(c.env.DB);
  const q = (c.req.query("q") ?? "").trim();
  const status = c.req.query("status");
  const filters = [sql`${suppliers.deletedAt} is null`];
  if (q) filters.push(or(like(suppliers.name, `%${q}%`), like(suppliers.code, `%${q}%`), like(suppliers.taxCode, `%${q}%`), like(suppliers.normalizedName, `%${normalizeText(q)}%`))!);
  if (status) filters.push(eq(suppliers.status, status));
  const rows = await db.select().from(suppliers).where(and(...filters)).orderBy(suppliers.name).limit(100);
  return c.json(ok(rows));
});

app.post("/api/v1/suppliers", async (c) => {
  const parsed = supplierInputSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Dữ liệu nhà cung cấp không hợp lệ."), 400);
  const db = drizzle(c.env.DB);
  const value = parsed.data;
  const supplierId = id();
  const ts = now();
  try {
    const statements: D1PreparedStatement[] = [
      c.env.DB.prepare(`
        INSERT INTO suppliers (
          id, code, name, canonical_name, normalized_name, tax_code, address, contact, phone,
          email, bank, bank_account, account_holder, status, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        supplierId, value.code, value.name, value.canonicalName, normalizeText(value.canonicalName),
        value.taxCode || null, value.address ?? null, value.contact ?? null, value.phone ?? null,
        value.email || null, value.bank ?? null, value.bankAccount ?? null, value.accountHolder ?? null,
        value.status, value.notes ?? null, ts, ts
      )
    ];
    for (const alias of value.aliases) {
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO supplier_aliases (id, supplier_id, alias, normalized_alias, created_at) VALUES (?, ?, ?, ?, ?)"
        ).bind(id(), supplierId, alias, normalizeText(alias), ts)
      );
    }
    await c.env.DB.batch(statements);
    return c.json(ok({ id: supplierId }), 201);
  } catch {
    return c.json(fail("SUPPLIER_CONFLICT", "Mã nhà cung cấp hoặc mã số thuế đã tồn tại."), 409);
  }
});

app.put("/api/v1/suppliers/:id", async (c) => {
  const parsed = supplierInputSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Dữ liệu nhà cung cấp không hợp lệ."), 400);
  const db = drizzle(c.env.DB);
  const value = parsed.data;
  const supplierId = c.req.param("id");
  const ts = now();
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(`
      UPDATE suppliers SET
        code = ?, name = ?, canonical_name = ?, normalized_name = ?, tax_code = ?, address = ?,
        contact = ?, phone = ?, email = ?, bank = ?, bank_account = ?, account_holder = ?,
        status = ?, notes = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).bind(
      value.code, value.name, value.canonicalName, normalizeText(value.canonicalName), value.taxCode || null,
      value.address ?? null, value.contact ?? null, value.phone ?? null, value.email || null,
      value.bank ?? null, value.bankAccount ?? null, value.accountHolder ?? null, value.status,
      value.notes ?? null, ts, supplierId
    ),
    c.env.DB.prepare("DELETE FROM supplier_aliases WHERE supplier_id = ?").bind(supplierId)
  ];
  for (const alias of value.aliases) {
    statements.push(
      c.env.DB.prepare(
        "INSERT INTO supplier_aliases (id, supplier_id, alias, normalized_alias, created_at) VALUES (?, ?, ?, ?, ?)"
      ).bind(id(), supplierId, alias, normalizeText(alias), ts)
    );
  }
  await c.env.DB.batch(statements);
  return c.json(ok({ id: supplierId }));
});

app.delete("/api/v1/suppliers/:id", async (c) => {
  const db = drizzle(c.env.DB);
  await db.update(suppliers).set({ deletedAt: now(), updatedAt: now() }).where(eq(suppliers.id, c.req.param("id")));
  return c.json(ok({ deleted: true }));
});

app.get("/api/v1/purchase-history", async (c) => {
  const db = drizzle(c.env.DB);
  const productId = c.req.query("productId");
  const supplierId = c.req.query("supplierId");
  const filters = [];
  if (productId) filters.push(eq(purchaseHistory.productId, productId));
  if (supplierId) filters.push(eq(purchaseHistory.supplierId, supplierId));
  const rows = await db.select().from(purchaseHistory)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(purchaseHistory.purchasedAt)).limit(200);
  return c.json(ok(rows));
});

app.post("/api/v1/purchase-history", async (c) => {
  const parsed = purchaseHistoryInputSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Dữ liệu lịch sử mua hàng không hợp lệ."), 400);
  const db = drizzle(c.env.DB);
  const value = parsed.data;
  const historyId = id();
  await db.insert(purchaseHistory).values({ id: historyId, ...value, createdAt: now() });
  return c.json(ok({ id: historyId }), 201);
});

app.get("/api/v1/purchase-history/product/:productId/stats", async (c) => {
  const db = drizzle(c.env.DB);
  const productId = c.req.param("productId");
  const [stats] = await db.select({
    lastPrice: sql<number | null>`(select unit_price_vnd from purchase_history ph2 where ph2.product_id = ${productId} order by purchased_at desc limit 1)`,
    lowestPrice: sql<number | null>`min(${purchaseHistory.unitPriceVnd})`,
    highestPrice: sql<number | null>`max(${purchaseHistory.unitPriceVnd})`,
    averagePrice: sql<number | null>`cast(avg(${purchaseHistory.unitPriceVnd}) as integer)`,
    totalQuantityMicros: sql<number>`coalesce(sum(${purchaseHistory.quantityMicros}),0)`,
    totalValue: sql<number>`coalesce(sum(${purchaseHistory.totalVnd}),0)`
  }).from(purchaseHistory).where(eq(purchaseHistory.productId, productId));
  return c.json(ok(stats));
});

app.post("/api/v1/normalization/match", async (c) => {
  const body = await c.req.json<{ entityType: "product" | "supplier"; rawValue: string }>();
  if (!body.rawValue || !["product","supplier"].includes(body.entityType)) {
    return c.json(fail("VALIDATION_ERROR", "Yêu cầu matching không hợp lệ."), 400);
  }
  const db = drizzle(c.env.DB);
  const normalized = normalizeText(body.rawValue);
  const candidates = body.entityType === "product"
    ? await db.select({ id: products.id, name: products.name, normalizedName: products.normalizedName })
        .from(products)
        .where(and(sql`${products.deletedAt} is null`, like(products.normalizedName, `%${normalized}%`)))
        .limit(10)
    : await db.select({ id: suppliers.id, name: suppliers.name, normalizedName: suppliers.normalizedName })
        .from(suppliers)
        .where(and(sql`${suppliers.deletedAt} is null`, like(suppliers.normalizedName, `%${normalized}%`)))
        .limit(10);
  const exact = candidates.find((x) => x.normalizedName === normalized);
  const confidenceBps = exact ? 10000 : candidates.length ? 7000 : 0;
  const matchId = id();
  await db.insert(normalizationMatches).values({
    id: matchId, entityType: body.entityType, rawValue: body.rawValue, normalizedValue: normalized,
    matchedEntityId: exact?.id ?? candidates[0]?.id ?? null, confidenceBps,
    status: exact ? "matched" : "pending", createdAt: now()
  });
  return c.json(ok({ id: matchId, normalized, confidenceBps, candidates }));
});

export default app;
