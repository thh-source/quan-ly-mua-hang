import {checkVertexHealth} from "../../lib/ai/vertex";

export async function GET() {
  const result = await checkVertexHealth();
  return Response.json({
    status: result.ok ? "ok" : "error",
    provider: "google-vertex-ai",
    transport: "cloudflare-ai-gateway",
    config: result.config,
    httpCode: result.httpCode,
    error: result.error,
    message: result.message,
  }, {
    status: result.ok ? 200 : 503,
    headers: {"Cache-Control": "no-store"},
  });
}
