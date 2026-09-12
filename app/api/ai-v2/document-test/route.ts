import { getChatGPTUser } from "../../../chatgpt-auth";
import { AI_DOCUMENT_MAX_BYTES, AiServiceError, parseDocumentFile } from "../../../lib/ai-v2";

const MAX_PREVIEW_CHARS = 12_000;
const MAX_CHUNKS = 80;

async function env() {
  return (await import("cloudflare:workers")).env as unknown as { BUCKET: R2Bucket };
}

function safeError(error: unknown) {
  if (error instanceof AiServiceError) {
    return { code: error.code, message: error.message };
  }
  return { code: "DOCUMENT_PARSE_FAILED", message: error instanceof Error ? error.message : "Unable to parse document." };
}

function validId(value: string) {
  return /^[a-zA-Z0-9_-]{8,80}$/.test(value);
}

async function readChunkedUpload(userId: string, input: Record<string, unknown>) {
  const uploadId = String(input.uploadId || "");
  const chunkCount = Number(input.chunkCount);
  const fileName = String(input.fileName || "");
  const mimeType = String(input.mimeType || "application/octet-stream");
  const fileSize = Number(input.fileSize);

  if (!validId(uploadId) || !Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > MAX_CHUNKS) {
    throw new AiServiceError("DOCUMENT_PARSE_FAILED", "Phiên tải file không hợp lệ.");
  }
  if (!fileName || !Number.isFinite(fileSize) || fileSize <= 0) {
    throw new AiServiceError("DOCUMENT_PARSE_FAILED", "Metadata file không hợp lệ.");
  }
  if (fileSize > AI_DOCUMENT_MAX_BYTES) {
    throw new AiServiceError("DOCUMENT_TOO_LARGE", "Document exceeds the configured AI size limit.");
  }

  const { BUCKET } = await env();
  const chunks: Uint8Array[] = [];
  const keys: string[] = [];
  let total = 0;

  try {
    for (let index = 0; index < chunkCount; index++) {
      const key = `ai-v2-temp/${userId}/${uploadId}/${String(index).padStart(4, "0")}`;
      keys.push(key);
      const object = await BUCKET.get(key);
      if (!object) throw new AiServiceError("DOCUMENT_PARSE_FAILED", `Thiếu chunk ${index + 1}/${chunkCount}.`);
      const bytes = new Uint8Array(await object.arrayBuffer());
      chunks.push(bytes);
      total += bytes.byteLength;
      if (total > AI_DOCUMENT_MAX_BYTES) throw new AiServiceError("DOCUMENT_TOO_LARGE", "Document exceeds the configured AI size limit.");
    }

    if (total !== fileSize) {
      throw new AiServiceError("DOCUMENT_PARSE_FAILED", `Kích thước file không khớp (${total}/${fileSize} bytes).`);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { fileName, mimeType, bytes };
  } finally {
    await Promise.all(keys.map((key) => BUCKET.delete(key).catch(() => undefined)));
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Yêu cầu đăng nhập" }, { status: 401 });

  try {
    let fileName = "";
    let mimeType = "application/octet-stream";
    let bytes: Uint8Array;
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const input = await request.json() as Record<string, unknown>;
      const assembled = await readChunkedUpload(user.id, input);
      fileName = assembled.fileName;
      mimeType = assembled.mimeType;
      bytes = assembled.bytes;
    } else {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return Response.json({ error: "Thiếu file cần kiểm tra" }, { status: 400 });
      }
      fileName = file.name;
      mimeType = file.type || "application/octet-stream";
      bytes = new Uint8Array(await file.arrayBuffer());
    }

    const parsed = parseDocumentFile({ fileName, mimeType, bytes });
    const preview = parsed.document.extractedText
      ? parsed.document.extractedText.slice(0, MAX_PREVIEW_CHARS)
      : null;

    return Response.json({
      ok: true,
      file: {
        name: parsed.document.fileName,
        mimeType: parsed.document.mimeType,
        sizeBytes: parsed.document.sizeBytes,
        kind: parsed.document.kind,
      },
      parser: parsed.parser,
      metadata: parsed.metadata,
      extractedTextLength: parsed.document.extractedText?.length || 0,
      preview,
      multimodalBytesReady: Boolean(parsed.document.bytes?.byteLength),
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const detail = safeError(error);
    const status = detail.code === "DOCUMENT_TOO_LARGE" ? 413 : detail.code === "DOCUMENT_UNSUPPORTED" ? 415 : 400;
    return Response.json({ ok: false, ...detail }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
