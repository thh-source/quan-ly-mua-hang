import { getChatGPTUser } from "../../../chatgpt-auth";

const MAX_CHUNK_BYTES = 512 * 1024;

async function env() {
  return (await import("cloudflare:workers")).env as unknown as { BUCKET: R2Bucket };
}

function validId(value: string) {
  return /^[a-zA-Z0-9_-]{8,80}$/.test(value);
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Yêu cầu đăng nhập" }, { status: 401 });

  const url = new URL(request.url);
  const uploadId = String(url.searchParams.get("uploadId") || "");
  const index = Number(url.searchParams.get("index"));
  if (!validId(uploadId) || !Number.isInteger(index) || index < 0 || index > 200) {
    return Response.json({ error: "Thông tin upload không hợp lệ" }, { status: 400 });
  }

  const body = new Uint8Array(await request.arrayBuffer());
  if (!body.byteLength) return Response.json({ error: "Chunk rỗng" }, { status: 400 });
  if (body.byteLength > MAX_CHUNK_BYTES) return Response.json({ error: "Chunk quá lớn" }, { status: 413 });

  const { BUCKET } = await env();
  const key = `ai-v2-temp/${user.id}/${uploadId}/${String(index).padStart(4, "0")}`;
  await BUCKET.put(key, body, {
    customMetadata: {
      uploadedAt: new Date().toISOString(),
      userId: user.id,
    },
  });

  return Response.json({ ok: true, index, size: body.byteLength }, {
    headers: { "Cache-Control": "no-store" },
  });
}
