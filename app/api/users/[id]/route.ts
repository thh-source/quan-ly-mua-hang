import { getDb, requireAdmin } from "../../../auth";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireAdmin(),
      { id } = await params;
    if (actor.id === id)
      return Response.json(
        { error: "Không thể khóa chính tài khoản đang đăng nhập" },
        { status: 400 },
      );
    const body = (await request.json()) as { active?: boolean },
      db = await getDb();
    await db
      .prepare(
        "UPDATE users SET active=?,updated_at=? WHERE id=? AND role!='master'",
      )
      .bind(body.active ? 1 : 0, new Date().toISOString(), id)
      .run();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Không có quyền" }, { status: 403 });
  }
}
