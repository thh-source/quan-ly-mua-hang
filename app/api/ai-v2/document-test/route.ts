import { getChatGPTUser } from "../../../chatgpt-auth";
import { AiServiceError, parseDocumentFile } from "../../../lib/ai-v2";

const MAX_PREVIEW_CHARS = 12_000;

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
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Thiếu file cần kiểm tra" }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed = parseDocumentFile({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes,
    });

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
