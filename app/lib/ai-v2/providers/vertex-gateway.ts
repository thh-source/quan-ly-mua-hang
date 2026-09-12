import { AiServiceError, type AiProvider, type AiProviderRequest, type AiProviderResult } from "../contracts";
import { prDraftJsonSchema } from "../pr-draft";

export type VertexGatewayEnv = {
  CLOUDFLARE_ACCOUNT_ID?: string;
  CF_AI_GATEWAY_ID?: string;
  CF_AI_GATEWAY_TOKEN?: string;
  GCP_PROJECT_ID?: string;
  VERTEX_AI_LOCATION?: string;
  VERTEX_AI_MODEL?: string;
};

type VertexConfig = {
  accountId: string;
  gatewayId: string;
  gatewayToken: string;
  projectId: string;
  location: string;
  model: string;
};

function required(value: unknown, name: string) {
  const text = String(value || "").trim();
  if (!text) throw new AiServiceError("AI_NOT_CONFIGURED", `Thiếu cấu hình ${name}.`);
  return text;
}

export function getVertexGatewayConfig(env: VertexGatewayEnv): VertexConfig {
  return {
    accountId: required(env.CLOUDFLARE_ACCOUNT_ID, "CLOUDFLARE_ACCOUNT_ID"),
    gatewayId: required(env.CF_AI_GATEWAY_ID, "CF_AI_GATEWAY_ID"),
    gatewayToken: required(env.CF_AI_GATEWAY_TOKEN, "CF_AI_GATEWAY_TOKEN"),
    projectId: required(env.GCP_PROJECT_ID, "GCP_PROJECT_ID"),
    location: String(env.VERTEX_AI_LOCATION || "global").trim() || "global",
    model: String(env.VERTEX_AI_MODEL || "gemini-3.5-flash").trim() || "gemini-3.5-flash",
  };
}

function endpoint(config: VertexConfig) {
  return `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(config.accountId)}/${encodeURIComponent(config.gatewayId)}/google-vertex-ai/v1/projects/${encodeURIComponent(config.projectId)}/locations/${encodeURIComponent(config.location)}/publishers/google/models/${encodeURIComponent(config.model)}:generateContent`;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunk)));
  }
  return btoa(binary);
}

function providerError(status: number, raw: string) {
  let payload: any = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch {}
  const message = String(payload?.error?.message || payload?.message || raw || `HTTP ${status}`).slice(0, 900);
  if (status === 401 || status === 403) return new AiServiceError("AI_AUTH_FAILED", message);
  if (status === 429) return new AiServiceError("AI_RATE_LIMITED", message);
  if (status >= 500) return new AiServiceError("AI_PROVIDER_UNAVAILABLE", message);
  return new AiServiceError("AI_INVALID_RESPONSE", message);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new AiServiceError("AI_TIMEOUT", "AI provider quá thời gian chờ.", error);
    throw new AiServiceError("AI_PROVIDER_UNAVAILABLE", error instanceof Error ? error.message : "Không thể kết nối AI provider.", error);
  } finally {
    clearTimeout(timer);
  }
}

function extractText(payload: any) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((part: any) => typeof part?.text === "string" ? part.text : "").join("").trim();
}

export class VertexGatewayProvider implements AiProvider {
  readonly name = "vertex-ai-via-cloudflare-gateway";
  private readonly config: VertexConfig;

  constructor(env: VertexGatewayEnv) {
    this.config = getVertexGatewayConfig(env);
  }

  async healthCheck() {
    const started = Date.now();
    const response = await fetchWithTimeout(endpoint(this.config), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cf-aig-authorization": `Bearer ${this.config.gatewayToken}`,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Trả lời đúng chữ OK." }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 16 },
      }),
    }, 30000);

    const raw = await response.text();
    if (!response.ok) throw providerError(response.status, raw);

    let payload: any = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch {}
    const text = extractText(payload);
    if (!text) throw new AiServiceError("AI_INVALID_RESPONSE", "Vertex AI trả về phản hồi không có text.");

    return {
      ok: true,
      provider: this.name,
      model: this.config.model,
      message: `Vertex AI hoạt động qua Cloudflare AI Gateway (${this.config.location}) trong ${Date.now() - started} ms.`,
    };
  }

  async analyze(request: AiProviderRequest): Promise<AiProviderResult> {
    const started = Date.now();
    const parts: Array<Record<string, unknown>> = [{ text: request.prompt }];

    if (request.document.extractedText?.trim()) {
      parts.push({ text: `\n\nNỘI DUNG TÀI LIỆU:\n${request.document.extractedText}` });
    } else if (request.document.bytes?.byteLength) {
      parts.push({
        inlineData: {
          mimeType: request.document.mimeType,
          data: bytesToBase64(request.document.bytes),
        },
      });
    } else {
      throw new AiServiceError("DOCUMENT_PARSE_FAILED", "Tài liệu không có text hoặc bytes để gửi AI.");
    }

    const response = await fetchWithTimeout(endpoint(this.config), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cf-aig-authorization": `Bearer ${this.config.gatewayToken}`,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: prDraftJsonSchema,
        },
      }),
    }, 90000);

    const raw = await response.text();
    if (!response.ok) throw providerError(response.status, raw);

    let payload: any = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch {}
    const text = extractText(payload);
    if (!text) throw new AiServiceError("AI_INVALID_RESPONSE", "Vertex AI không trả về JSON PR draft.");

    let rawJson: unknown;
    try { rawJson = JSON.parse(text); }
    catch (error) { throw new AiServiceError("AI_INVALID_RESPONSE", "Vertex AI trả về JSON không hợp lệ.", error); }

    return {
      provider: this.name,
      model: this.config.model,
      requestId: request.requestId,
      rawJson,
      durationMs: Date.now() - started,
    };
  }
}
