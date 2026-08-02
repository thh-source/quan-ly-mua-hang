import { removeCurrentSession } from "../../../auth";
export async function POST() {
  await removeCurrentSession();
  return Response.json({ ok: true });
}
