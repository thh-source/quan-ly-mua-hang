import { getChatGPTUser } from "../../../chatgpt-auth";

async function bindings() {
  return (await import("cloudflare:workers")).env;
}

async function ensureSchema() {
  const env = await bindings();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS project_contract_state (
      owner_user_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    )`,
  ).run();
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Yêu cầu đăng nhập" }, { status: 401 });
  await ensureSchema();
  const env = await bindings();
  const row = await env.DB.prepare(
    "SELECT payload, updated_at, version FROM project_contract_state WHERE owner_user_id=?",
  )
    .bind(user.id)
    .first<{ payload: string; updated_at: string; version: number }>();
  if (!row) return Response.json({ data: null, updatedAt: null, version: 0 });
  return Response.json({
    data: JSON.parse(row.payload),
    updatedAt: row.updated_at,
    version: row.version,
  });
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Yêu cầu đăng nhập" }, { status: 401 });
  await ensureSchema();
  const data = await request.json();
  const payload = JSON.stringify(data);
  if (payload.length > 1_800_000)
    return Response.json({ error: "Dữ liệu vượt giới hạn cho phép" }, { status: 413 });
  const env = await bindings();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO project_contract_state (owner_user_id,payload,updated_at,version)
     VALUES (?,?,?,1)
     ON CONFLICT(owner_user_id) DO UPDATE SET
       payload=excluded.payload,
       updated_at=excluded.updated_at,
       version=project_contract_state.version+1`,
  )
    .bind(user.id, payload, now)
    .run();
  return Response.json({ ok: true, updatedAt: now });
}
