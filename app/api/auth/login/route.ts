import { createSession, setSessionCookie, verifyLogin } from "../../../auth";
export async function POST(request: Request) {
  const body = (await request.json()) as {
      username?: string;
      password?: string;
    },
    username = String(body.username || "").trim(),
    password = String(body.password || "");
  if (!username || !password)
    return Response.json({ error: "Thiếu thông tin" }, { status: 400 });
  const user = await verifyLogin(username, password);
  if (!user)
    return Response.json(
      { error: "Sai tài khoản hoặc mật khẩu" },
      { status: 401 },
    );
  const session = await createSession(user.id);
  await setSessionCookie(session.token, session.expires);
  return Response.json({ user });
}
