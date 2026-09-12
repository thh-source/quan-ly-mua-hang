import { getChatGPTUser } from "../../../chatgpt-auth";
import { AiServiceError, parseDocumentFile, readChunkedUpload } from "../../../lib/ai-v2";

const MAX_PREVIEW_CHARS = 12_000;

async function env() {
  return (await import("cloudflare:workers")).env as unknown as { BUCKET: R2Bucket };
}

function safeError(error: unknown) {
  if (error instanceof AiServiceError) {
    return { code: error.code, message: error.message };
  }
  return { code: "DOCUMENT_PARSE_FAILED", message: error instanceof Error ? error.message : "Unable to parse document." };
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
      const { BUCKET } = await env();
      const assembled = await readChunkedUpload(BUCKET, user.id, input);
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
