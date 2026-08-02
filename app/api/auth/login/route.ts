import { createSession, setSessionCookie, verifyLogin } from "../../../auth";
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
        username?: string;
        password?: string;
      },
      username = String(body.username || "").trim(),
      password = String(body.password || "").trim();
    if (!username || !password)
      return Response.json({ error: "Thiếu thông tin" }, { status: 400 });
    const user = await verifyLogin(username, password);
    if (!user)
      return Response.json(
        { error: "ID hoặc mật khẩu không khớp với cấu hình Master" },
        { status: 401 },
      );
    const session = await createSession(user.id);
    await setSessionCookie(session.token, session.expires);
    return Response.json({ user });
  } catch (error) {
    console.error("LOGIN_ERROR", error);
    const message = error instanceof Error ? error.message : "";
    if (message === "MASTER_SECRET_MISSING")
      return Response.json(
        { error: "Worker chưa nhận MASTER_ADMIN_PASSWORD" },
        { status: 503 },
      );
    return Response.json(
      { error: "Lỗi kết nối D1 hoặc cấu hình Worker" },
      { status: 500 },
    );
  }
}
