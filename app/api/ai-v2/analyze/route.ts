import { getChatGPTUser } from "../../../chatgpt-auth";
import {
  AiPrService,
  AiServiceError,
  parseDocumentFile,
  readChunkedUpload,
  VertexGatewayProvider,
  type VertexGatewayEnv,
} from "../../../lib/ai-v2";

type RuntimeEnv = VertexGatewayEnv & { BUCKET: R2Bucket };

async function runtime() {
  return (await import("cloudflare:workers")).env as unknown as RuntimeEnv;
}

function sanitize(message: string) {
  return message
    .replace(/AIza[\w-]+/g, "[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]")
    .slice(0, 900);
}

function statusFor(code: string) {
  if (code === "AI_NOT_CONFIGURED") return 503;
  if (code === "AI_RATE_LIMITED") return 429;
  if (code === "AI_TIMEOUT") return 504;
  if (code === "DOCUMENT_TOO_LARGE") return 413;
  if (code === "DOCUMENT_UNSUPPORTED") return 415;
  if (code === "DOCUMENT_PARSE_FAILED" || code === "PR_DRAFT_INVALID" || code === "AI_INVALID_RESPONSE") return 400;
  return 502;
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ ok: false, error: "Yêu cầu đăng nhập" }, { status: 401 });

  try {
    const input = await request.json() as Record<string, unknown>;
    const env = await runtime();
    const assembled = await readChunkedUpload(env.BUCKET, user.id, input);
    const parsed = parseDocumentFile(assembled);
    const provider = new VertexGatewayProvider(env);
    const service = new AiPrService(provider);
    const draft = await service.analyzeDocument(parsed.document);

    return Response.json({
      ok: true,
      draft,
      source: {
        fileName: parsed.document.fileName,
        mimeType: parsed.document.mimeType,
        kind: parsed.document.kind,
        parser: parsed.parser,
        sizeBytes: parsed.document.sizeBytes,
        extractedTextLength: parsed.document.extractedText?.length || 0,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AiServiceError) {
      return Response.json({ ok: false, code: error.code, message: sanitize(error.message) }, {
        status: statusFor(error.code),
        headers: { "Cache-Control": "no-store" },
      });
    }
    return Response.json({ ok: false, code: "AI_PROVIDER_UNAVAILABLE", message: sanitize(error instanceof Error ? error.message : "Không thể phân tích tài liệu.") }, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
