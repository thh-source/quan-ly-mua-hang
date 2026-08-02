import { getCurrentUser, verifyLogin } from "../../../auth";

export async function POST(request: Request) {
  const current = await getCurrentUser();
  if (!current)
    return Response.json({ error: "Phiên đăng nhập đã hết hạn" }, { status: 401 });
  const body = (await request.json()) as { password?: string };
  const verified = await verifyLogin(current.username, String(body.password || ""));
  if (!verified)
    return Response.json({ error: "Mật khẩu không đúng" }, { status: 401 });
  return Response.json({ ok: true });
}
