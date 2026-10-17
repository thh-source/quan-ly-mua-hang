import { cookies } from "next/headers";

type RuntimeEnv = {
  DB: D1Database;
  MASTER_ADMIN_ID?: string;
  MASTER_ADMIN_PASSWORD?: string;
};
export type AppUser = {
  id: string;
  username: string;
  displayName: string;
  role: "master" | "admin" | "user";
};

async function runtime() {
  return (await import("cloudflare:workers")).env as unknown as RuntimeEnv;
}
const hex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes instanceof ArrayBuffer ? bytes : bytes.buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const randomHex = (size = 32) => {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return hex(bytes);
};

export async function ensureAuthSchema() {
  const { DB } = await runtime();
  await DB.batch([
    DB.prepare(
      "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, must_change_password INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    ),
    DB.prepare(
      "CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)",
    ),
    DB.prepare(
      "CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)",
    ),
    DB.prepare(
      "CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at)",
    ),
  ]);
}

export async function hashPassword(password: string, saltHex: string) {
  const material = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    ),
    salt = Uint8Array.from(
      saltHex.match(/.{1,2}/g)!.map((x) => parseInt(x, 16)),
    );
  return hex(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: 50000 },
      material,
      256,
    ),
  );
}
export const newSalt = () => randomHex(16);
export async function hashToken(token: string) {
  return hex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
  );
}

export async function bootstrapMaster(username: string, password: string) {
  const env = await runtime(),
    masterId = String(env.MASTER_ADMIN_ID || "bosmile").trim(),
    configuredPassword = String(env.MASTER_ADMIN_PASSWORD || "")
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");
  if (username.trim() !== masterId) return null;
  if (!configuredPassword) throw new Error("MASTER_SECRET_MISSING");
  if (password.trim() !== configuredPassword) return null;
  await ensureAuthSchema();
  const existing = await env.DB.prepare(
    "SELECT id,username,display_name AS displayName,role FROM users WHERE username=?",
  )
    .bind(masterId)
    .first<AppUser>();
  if (existing) return existing;
  const salt = newSalt(),
    hash = await hashPassword(password, salt),
    now = new Date().toISOString(),
    id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO users (id,username,display_name,password_hash,password_salt,role,active,must_change_password,created_at,updated_at) VALUES (?,?,?,?,?,'master',1,0,?,?)",
  )
    .bind(id, masterId, "Master Admin", hash, salt, now, now)
    .run();
  return {
    id,
    username: masterId,
    displayName: "Master Admin",
    role: "master" as const,
  };
}

export async function verifyLogin(username: string, password: string) {
  await ensureAuthSchema();
  const env = await runtime();
  let row = await env.DB.prepare(
    "SELECT id,username,display_name AS displayName,password_hash AS passwordHash,password_salt AS passwordSalt,role,active FROM users WHERE username=?",
  )
    .bind(username)
    .first<
      AppUser & { passwordHash: string; passwordSalt: string; active: number }
    >();
  if (!row) {
    const master = await bootstrapMaster(username, password);
    if (!master) return null;
    row = await env.DB.prepare(
      "SELECT id,username,display_name AS displayName,password_hash AS passwordHash,password_salt AS passwordSalt,role,active FROM users WHERE username=?",
    )
      .bind(username)
      .first<
        AppUser & { passwordHash: string; passwordSalt: string; active: number }
      >();
  }
  if (!row || !row.active) return null;
  const candidate = await hashPassword(password, row.passwordSalt);
  if (candidate !== row.passwordHash) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
  };
}

export async function createSession(userId: string) {
  await ensureAuthSchema();
  const env = await runtime(),
    token = randomHex(32),
    tokenHash = await hashToken(token),
    created = new Date(),
    expires = new Date(created.getTime() + 12 * 60 * 60 * 1000);
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)",
  )
    .bind(tokenHash, userId, created.toISOString(), expires.toISOString())
    .run();
  return { token, expires };
}

export async function getCurrentUser(): Promise<AppUser | null> {
  await ensureAuthSchema();
  const token = (await cookies()).get("mh_session")?.value;
  if (!token) return null;
  const env = await runtime(),
    tokenHash = await hashToken(token),
    now = new Date().toISOString();
  const row = await env.DB.prepare(
    "SELECT u.id,u.username,u.display_name AS displayName,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1",
  )
    .bind(tokenHash, now)
    .first<AppUser>();
  return row || null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "master" && user.role !== "admin")
    throw new Error("FORBIDDEN");
  return user;
}
export async function removeCurrentSession() {
  const jar = await cookies(),
    token = jar.get("mh_session")?.value;
  if (token) {
    const env = await runtime();
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(await hashToken(token))
      .run();
  }
  jar.delete("mh_session");
}
export async function setSessionCookie(token: string, expires: Date) {
  (await cookies()).set("mh_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    expires,
  });
}
export async function getDb() {
  return (await runtime()).DB;
}
