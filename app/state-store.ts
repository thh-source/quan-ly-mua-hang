/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDb, type AppUser } from "./auth";

export const stateId = (userId: string) => `procurement:${userId}`;

export async function resolveWorkspace(actor: AppUser, requested?: string | null) {
  if (actor.role === "user") return actor.id;
  if (!requested) return actor.id;
  const db = await getDb();
  const row = await db
    .prepare("SELECT id FROM users WHERE id=? AND active=1")
    .bind(requested)
    .first<{ id: string }>();
  return row?.id || actor.id;
}

export async function readWorkspace(userId: string, allowLegacy = false) {
  const db = await getDb();
  let row = await db
    .prepare("SELECT payload,updated_at,version FROM app_state WHERE id=?")
    .bind(stateId(userId))
    .first<{ payload: string; updated_at: string; version: number }>();
  if (!row && allowLegacy)
    row = await db
      .prepare("SELECT payload,updated_at,version FROM app_state WHERE id='procurement'")
      .first<{ payload: string; updated_at: string; version: number }>();
  return row;
}

const add = (value: unknown, offset: number) =>
  typeof value === "number" ? value + offset : value;

function remap(data: Record<string, any>, index: number) {
  const offset = (index + 1) * 10_000_000_000_000;
  const suppliers = (data.suppliers || []).map((s: any) => ({
    ...s,
    id: add(s.id, offset),
  }));
  const mapItem = (item: any) => ({ ...item, id: add(item.id, offset) });
  const quotes: Record<string, unknown> = {};
  const remapQuotes = (source: Record<string, unknown>) => {
    const target: Record<string, unknown> = {};
    Object.entries(source || {}).forEach(([itemId, supplierQuotes]) => {
    const next: Record<string, unknown> = {};
    Object.entries((supplierQuotes || {}) as Record<string, unknown>).forEach(
      ([supplierId, quote]) => {
        next[String(Number(supplierId) + offset)] = quote;
      },
    );
      target[String(Number(itemId) + offset)] = next;
    });
    return target;
  };
  Object.assign(quotes, remapQuotes(data.quotes || {}));
  const quotesByPr: Record<string, unknown> = {};
  Object.entries(data.quotesByPr || {}).forEach(([prId, prQuotes]) => {
    quotesByPr[String(Number(prId) + offset)] = remapQuotes(
      prQuotes as Record<string, unknown>,
    );
  });
  const quoteSupplierIdsByPr: Record<string, number[]> = {};
  Object.entries(data.quoteSupplierIdsByPr || {}).forEach(([prId, ids]) => {
    quoteSupplierIdsByPr[String(Number(prId) + offset)] = (
      ids as number[]
    ).map((id) => Number(add(id, offset)));
  });
  return {
    prs: (data.prs || []).map((pr: any) => ({
      ...pr,
      id: add(pr.id, offset),
      items: (pr.items || []).map(mapItem),
    })),
    products: (data.products || []).map(mapItem),
    suppliers,
    quotes,
    quotesByPr,
    quoteSupplierIdsByPr,
    pos: (data.pos || []).map((po: any) => ({
      ...po,
      id: add(po.id, offset),
      supplierId: add(po.supplierId, offset),
      items: (po.items || []).map((item: any) => ({
        ...mapItem(item),
        allocations: (item.allocations || []).map((allocation: any) => ({
          ...allocation,
          prId: add(allocation.prId, offset),
          prItemId: add(allocation.prItemId, offset),
        })),
      })),
      docs: (po.docs || []).map((d: any) => ({ ...d, id: add(d.id, offset) })),
      payments: (po.payments || []).map((p: any) => ({
        ...p,
        id: add(p.id, offset),
      })),
    })),
    items: (data.items || []).map(mapItem),
    quoteSupplierIds: (data.quoteSupplierIds || []).map((id: number) =>
      add(id, offset),
    ),
    hiddenContractIds: (data.hiddenContractIds || []).map((id: number) =>
      add(id, offset),
    ),
  };
}

export async function readAllWorkspaces() {
  const db = await getDb();
  const result = await db
    .prepare(
      "SELECT a.payload,a.updated_at,a.version FROM app_state a WHERE a.id LIKE 'procurement:%' ORDER BY a.id",
    )
    .all<{ payload: string; updated_at: string; version: number }>();
  const parts = result.results.map((row, index) =>
    remap(JSON.parse(row.payload), index),
  );
  const combined: Record<string, any> = {
    prs: [], products: [], suppliers: [], quotes: {}, quotesByPr: {}, quoteSupplierIdsByPr: {}, pos: [], items: [], quoteSupplierIds: [], hiddenContractIds: [], trash: [], poCart: [],
  };
  for (const part of parts) {
    combined.prs.push(...part.prs);
    combined.products.push(...part.products);
    combined.suppliers.push(...part.suppliers);
    Object.assign(combined.quotes, part.quotes);
    Object.assign(combined.quotesByPr, part.quotesByPr);
    Object.assign(combined.quoteSupplierIdsByPr, part.quoteSupplierIdsByPr);
    combined.pos.push(...part.pos);
    combined.items.push(...part.items);
    combined.quoteSupplierIds.push(...part.quoteSupplierIds);
    combined.hiddenContractIds.push(...part.hiddenContractIds);
  }
  return combined;
}
