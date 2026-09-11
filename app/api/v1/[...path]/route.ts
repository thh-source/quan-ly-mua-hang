import { getChatGPTUser } from "../../../chatgpt-auth";

async function env() {
  return (await import("cloudflare:workers")).env;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function requireUser() {
  const user = await getChatGPTUser();
  if (!user) throw new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Yêu cầu đăng nhập" } }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
  return user;
}

function ok(data: unknown) {
  return Response.json({ data });
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    await requireUser();
    const { path } = await context.params;
    const route = path.join("/");
    const { DB } = await env();
    const url = new URL(request.url);

    if (route === "products") {
      const q = url.searchParams.get("q")?.trim() ?? "";
      const search = `%${q}%`;
      const normalized = `%${normalizeText(q)}%`;
      try {
        const result = q
          ? await DB.prepare(`SELECT id, code, name, canonical_name as canonicalName, unit, status FROM products WHERE deleted_at IS NULL AND (name LIKE ? OR code LIKE ? OR normalized_name LIKE ?) ORDER BY name LIMIT 100`).bind(search, search, normalized).all()
          : await DB.prepare(`SELECT id, code, name, canonical_name as canonicalName, unit, status FROM products WHERE deleted_at IS NULL ORDER BY name LIMIT 100`).all();
        return ok(result.results ?? []);
      } catch {
        return ok([]);
      }
    }

    if (route === "suppliers") {
      const q = url.searchParams.get("q")?.trim() ?? "";
      const search = `%${q}%`;
      const normalized = `%${normalizeText(q)}%`;
      try {
        const result = q
          ? await DB.prepare(`SELECT id, code, name, tax_code as taxCode, contact, phone, status FROM suppliers WHERE deleted_at IS NULL AND (name LIKE ? OR code LIKE ? OR tax_code LIKE ? OR normalized_name LIKE ?) ORDER BY name LIMIT 100`).bind(search, search, search, normalized).all()
          : await DB.prepare(`SELECT id, code, name, tax_code as taxCode, contact, phone, status FROM suppliers WHERE deleted_at IS NULL ORDER BY name LIMIT 100`).all();
        return ok(result.results ?? []);
      } catch {
        return ok([]);
      }
    }

    if (route === "purchase-history") {
      try {
        const result = await DB.prepare(`SELECT id, product_id as productId, supplier_id as supplierId, purchased_at as purchasedAt, po_number as poNumber, quantity_micros as quantityMicros, unit_price_vnd as unitPriceVnd, total_vnd as totalVnd FROM purchase_history ORDER BY purchased_at DESC LIMIT 200`).all();
        return ok(result.results ?? []);
      } catch {
        return ok([]);
      }
    }

    return Response.json({ error: { code: "NOT_FOUND", message: "API không tồn tại" } }, { status: 404 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: { code: "INTERNAL_ERROR", message: "Không thể xử lý yêu cầu" } }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    await requireUser();
    const { path } = await context.params;
    const route = path.join("/");
    if (route !== "normalization/match") {
      return Response.json({ error: { code: "NOT_FOUND", message: "API không tồn tại" } }, { status: 404 });
    }

    const body = await request.json() as { entityType?: "product" | "supplier"; rawValue?: string };
    if (!body.rawValue?.trim() || !body.entityType || !["product", "supplier"].includes(body.entityType)) {
      return Response.json({ error: { code: "VALIDATION_ERROR", message: "Yêu cầu matching không hợp lệ" } }, { status: 400 });
    }

    const { DB } = await env();
    const normalized = normalizeText(body.rawValue);
    const table = body.entityType === "product" ? "products" : "suppliers";
    try {
      const candidates = await DB.prepare(`SELECT id, name, normalized_name as normalizedName FROM ${table} WHERE deleted_at IS NULL AND normalized_name LIKE ? LIMIT 10`).bind(`%${normalized}%`).all();
      const rows = (candidates.results ?? []) as Array<{ id: string; name: string; normalizedName: string }>;
      const exact = rows.find((x) => x.normalizedName === normalized);
      const confidenceBps = exact ? 10000 : rows.length ? 7000 : 0;
      const matchId = crypto.randomUUID();
      await DB.prepare(`INSERT INTO normalization_matches (id, entity_type, raw_value, normalized_value, matched_entity_id, confidence_bps, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        matchId,
        body.entityType,
        body.rawValue,
        normalized,
        exact?.id ?? rows[0]?.id ?? null,
        confidenceBps,
        exact ? "matched" : "pending",
        new Date().toISOString(),
      ).run();
      return ok({ id: matchId, normalized, confidenceBps, candidates: rows });
    } catch {
      return ok({ id: null, normalized, confidenceBps: 0, candidates: [] });
    }
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: { code: "INTERNAL_ERROR", message: "Không thể xử lý yêu cầu" } }, { status: 500 });
  }
}
