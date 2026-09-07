import { Hono } from "hono";
import { cors } from "hono/cors";
import { drizzle } from "drizzle-orm/d1";
import { products, productAliases, suppliers, supplierAliases, purchaseHistory, normalizationMatches } from "@scmh/database";
import { normalizeText, productInputSchema, supplierInputSchema, purchaseHistoryInputSchema } from "@scmh/shared";
import { and, desc, eq, like, or, sql } from "drizzle-orm";

type Bindings = {
  DB: D1Database;
  FILES: R2Bucket;
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
    await db.transaction(async (tx) => {
      await tx.insert(products).values({
        id: productId,
        code: value.code,
        name: value.name,
        canonicalName: value.canonicalName,
        normalizedName: normalizeText(value.canonicalName),
        categoryId: value.categoryId ?? null,
        unit: value.unit,
        brand: value.brand ?? null,
        manufacturer: value.manufacturer ?? null,
        technicalDescription: value.technicalDescription ?? null,
        specification: value.specification ?? null,
        status: value.status,
        notes: value.notes ?? null,
        createdAt: ts,
        updatedAt: ts
      });
      for (const alias of value.aliases) {
        await tx.insert(productAliases).values({ id: id(), productId, alias, normalizedAlias: normalizeText(alias), createdAt: ts });
      }
    });
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
  await db.transaction(async (tx) => {
    await tx.update(products).set({
      code: value.code, name: value.name, canonicalName: value.canonicalName,
      normalizedName: normalizeText(value.canonicalName), categoryId: value.categoryId ?? null,
      unit: value.unit, brand: value.brand ?? null, manufacturer: value.manufacturer ?? null,
      technicalDescription: value.technicalDescription ?? null, specification: value.specification ?? null,
      status: value.status, notes: value.notes ?? null, updatedAt: now()
    }).where(eq(products.id, productId));
    await tx.delete(productAliases).where(eq(productAliases.productId, productId));
    for (const alias of value.aliases) {
      await tx.insert(productAliases).values({ id: id(), productId, alias, normalizedAlias: normalizeText(alias), createdAt: now() });
    }
  });
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
    await db.transaction(async (tx) => {
      await tx.insert(suppliers).values({
        id: supplierId, code: value.code, name: value.name, canonicalName: value.canonicalName,
        normalizedName: normalizeText(value.canonicalName), taxCode: value.taxCode || null,
        address: value.address ?? null, contact: value.contact ?? null, phone: value.phone ?? null,
        email: value.email || null, bank: value.bank ?? null, bankAccount: value.bankAccount ?? null,
        accountHolder: value.accountHolder ?? null, status: value.status, notes: value.notes ?? null,
        createdAt: ts, updatedAt: ts
      });
      for (const alias of value.aliases) {
        await tx.insert(supplierAliases).values({ id: id(), supplierId, alias, normalizedAlias: normalizeText(alias), createdAt: ts });
      }
    });
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
  await db.transaction(async (tx) => {
    await tx.update(suppliers).set({
      code: value.code, name: value.name, canonicalName: value.canonicalName,
      normalizedName: normalizeText(value.canonicalName), taxCode: value.taxCode || null,
      address: value.address ?? null, contact: value.contact ?? null, phone: value.phone ?? null,
      email: value.email || null, bank: value.bank ?? null, bankAccount: value.bankAccount ?? null,
      accountHolder: value.accountHolder ?? null, status: value.status, notes: value.notes ?? null, updatedAt: now()
    }).where(eq(suppliers.id, supplierId));
    await tx.delete(supplierAliases).where(eq(supplierAliases.supplierId, supplierId));
    for (const alias of value.aliases) {
      await tx.insert(supplierAliases).values({ id: id(), supplierId, alias, normalizedAlias: normalizeText(alias), createdAt: now() });
    }
  });
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
  const source = body.entityType === "product" ? products : suppliers;
  const candidates = await db.select({ id: source.id, name: source.name, normalizedName: source.normalizedName })
    .from(source).where(like(source.normalizedName, `%${normalized}%`)).limit(10);
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
