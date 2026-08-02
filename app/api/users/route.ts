import { getDb, hashPassword, newSalt, requireAdmin } from "../../auth";

export async function GET() {
  try {
    await requireAdmin();
    const db = await getDb(),
      result = await db
        .prepare(
          "SELECT id,username,display_name AS displayName,role,active,created_at AS createdAt FROM users ORDER BY created_at DESC",
        )
        .all();
    return Response.json({ users: result.results });
  } catch {
    return Response.json({ error: "Không có quyền" }, { status: 403 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin(),
      body = (await request.json()) as {
        username?: string;
        password?: string;
        displayName?: string;
        role?: string;
      },
      username = String(body.username || "").trim(),
      password = String(body.password || ""),
      displayName = String(body.displayName || "").trim(),
      role = body.role === "admin" ? "admin" : "user";
    if (!username || !displayName || password.length < 8)
      return Response.json(
        { error: "ID, tên và mật khẩu tối thiểu 8 ký tự là bắt buộc" },
        { status: 400 },
      );
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username))
      return Response.json(
        { error: "ID chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới" },
        { status: 400 },
      );
    const db = await getDb(),
      exists = await db
        .prepare("SELECT id FROM users WHERE username=?")
        .bind(username)
        .first();
    if (exists)
      return Response.json({ error: "ID đã tồn tại" }, { status: 409 });
    const salt = newSalt(),
      hash = await hashPassword(password, salt),
      now = new Date().toISOString();
    await db
      .prepare(
        "INSERT INTO users (id,username,display_name,password_hash,password_salt,role,active,must_change_password,created_at,updated_at) VALUES (?,?,?,?,?,?,1,1,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        username,
        displayName,
        hash,
        salt,
        role,
        now,
        now,
      )
      .run();
    await db
      .prepare(
        "INSERT INTO audit_logs (action,entity_type,entity_id,created_at) VALUES ('CREATE_USER','user',?,?)",
      )
      .bind(`${actor.username}:${username}`, now)
      .run();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Không có quyền" }, { status: 403 });
  }
}
