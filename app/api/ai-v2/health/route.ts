import { getChatGPTUser } from "../../../chatgpt-auth";
import { AiServiceError } from "../../../lib/ai-v2/contracts";
import { VertexGatewayProvider, type VertexGatewayEnv } from "../../../lib/ai-v2/providers/vertex-gateway";

function sanitize(message: string) {
  return message.replace(/AIza[\w-]+/g, "[REDACTED]").replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]").slice(0, 900);
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ ok: false, error: "Yêu cầu đăng nhập" }, { status: 401 });

  let env: VertexGatewayEnv;
  try {
    env = (await import("cloudflare:workers")).env as unknown as VertexGatewayEnv;
  } catch {
    return Response.json({ ok: false, code: "ENV_UNAVAILABLE", message: "Không đọc được Cloudflare runtime env." }, { status: 503 });
  }

  const configured = {
    CLOUDFLARE_ACCOUNT_ID: Boolean(String(env.CLOUDFLARE_ACCOUNT_ID || "").trim()),
    CF_AI_GATEWAY_ID: Boolean(String(env.CF_AI_GATEWAY_ID || "").trim()),
    CF_AI_GATEWAY_TOKEN: Boolean(String(env.CF_AI_GATEWAY_TOKEN || "").trim()),
    GCP_PROJECT_ID: Boolean(String(env.GCP_PROJECT_ID || "").trim()),
    VERTEX_AI_LOCATION: String(env.VERTEX_AI_LOCATION || "asia-southeast1").trim() || "asia-southeast1",
    VERTEX_AI_MODEL: String(env.VERTEX_AI_MODEL || "gemini-2.5-flash").trim() || "gemini-2.5-flash",
  };

  try {
    const provider = new VertexGatewayProvider(env);
    const health = await provider.healthCheck();
    return Response.json({ ok: true, configured, health }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AiServiceError) {
      return Response.json({ ok: false, configured, code: error.code, message: sanitize(error.message) }, { status: error.code === "AI_NOT_CONFIGURED" ? 503 : 502, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ ok: false, configured, code: "AI_PROVIDER_UNAVAILABLE", message: sanitize(error instanceof Error ? error.message : "AI provider health check thất bại.") }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
