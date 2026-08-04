import { requireAdmin } from "../../../auth";

async function bindings() {
  return (await import("cloudflare:workers")).env;
}

const D1_FREE_BYTES = 5 * 1024 * 1024 * 1024;
const R2_FREE_BYTES = 10 * 1024 * 1024 * 1024;

async function ensureFiles() {
  const env = await bindings();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, file_name TEXT NOT NULL, object_key TEXT NOT NULL, content_type TEXT NOT NULL, size INTEGER NOT NULL, uploaded_at TEXT NOT NULL, owner_user_id TEXT)",
  ).run();
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "Không có quyền truy cập" }, { status: 403 });
  }
  await ensureFiles();
  const env = await bindings();
  const [stateRows, fileRows, userRows] = await Promise.all([
    env.DB.prepare(
      "SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(payload)),0) AS bytes, MAX(updated_at) AS updatedAt FROM app_state",
    ).first<{ count: number; bytes: number; updatedAt: string | null }>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS count, COALESCE(SUM(size),0) AS bytes, MAX(uploaded_at) AS updatedAt FROM files",
    ).first<{ count: number; bytes: number; updatedAt: string | null }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>(),
  ]);
  const dbBytes = Number(stateRows?.bytes || 0);
  const r2Bytes = Number(fileRows?.bytes || 0);
  return Response.json({
    generatedAt: new Date().toISOString(),
    freeTier: {
      d1Bytes: D1_FREE_BYTES,
      r2Bytes: R2_FREE_BYTES,
      d1RowsReadPerDay: 5_000_000,
      d1RowsWrittenPerDay: 100_000,
      r2ClassAOperationsPerMonth: 1_000_000,
      r2ClassBOperationsPerMonth: 10_000_000,
    },
    d1: {
      estimatedBytes: dbBytes,
      remainingBytes: Math.max(0, D1_FREE_BYTES - dbBytes),
      usedPercent: (dbBytes / D1_FREE_BYTES) * 100,
      stateRecords: Number(stateRows?.count || 0),
      users: Number(userRows?.count || 0),
      updatedAt: stateRows?.updatedAt,
    },
    r2: {
      estimatedBytes: r2Bytes,
      remainingBytes: Math.max(0, R2_FREE_BYTES - r2Bytes),
      usedPercent: (r2Bytes / R2_FREE_BYTES) * 100,
      fileCount: Number(fileRows?.count || 0),
      updatedAt: fileRows?.updatedAt,
    },
  });
}
