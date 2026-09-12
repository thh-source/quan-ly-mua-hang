type RuntimeEnv = {
  CLOUDFLARE_ACCOUNT_ID?: string;
  CF_AI_GATEWAY_ID?: string;
  CF_AI_GATEWAY_TOKEN?: string;
  GCP_PROJECT_ID?: string;
  VERTEX_AI_LOCATION?: string;
  VERTEX_AI_MODEL?: string;
};

export type VertexConfig = {
  accountId: string;
  gatewayId: string;
  gatewayToken: string;
  projectId: string;
  location: string;
  model: string;
  baseUrl: string;
};

export type VertexHealthResult = {
  ok: boolean;
  config: {
    gateway: boolean;
    token: boolean;
    project: boolean;
    location: string;
    model: string;
  };
  httpCode: number | null;
  error: string | null;
  message: string;
};

async function runtime(): Promise<RuntimeEnv> {
  return (await import("cloudflare:workers")).env as unknown as RuntimeEnv;
}

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").slice(0, 500);
}

export async function getVertexConfig(): Promise<VertexConfig> {
  const env = await runtime();
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const gatewayId = String(env.CF_AI_GATEWAY_ID || "gemini-gateway").trim();
  const gatewayToken = String(env.CF_AI_GATEWAY_TOKEN || "").trim();
  const projectId = String(env.GCP_PROJECT_ID || "").trim();
  const location = String(env.VERTEX_AI_LOCATION || "global").trim();
  const model = String(env.VERTEX_AI_MODEL || "gemini-3.5-flash").trim().replace(/^publishers\/google\/models\//, "");

  const missing = [
    !accountId && "CLOUDFLARE_ACCOUNT_ID",
    !gatewayId && "CF_AI_GATEWAY_ID",
    !gatewayToken && "CF_AI_GATEWAY_TOKEN",
    !projectId && "GCP_PROJECT_ID",
  ].filter(Boolean);

  if (missing.length) throw new Error(`AI_CONFIG_MISSING:${missing.join(",")}`);

  return {
    accountId,
    gatewayId,
    gatewayToken,
    projectId,
    location,
    model,
    baseUrl: `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(accountId)}/${encodeURIComponent(gatewayId)}/google-vertex-ai/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}`,
  };
}

export async function generateVertexContent(body: unknown) {
  const cfg = await getVertexConfig();
  const url = `${cfg.baseUrl}/publishers/google/models/${encodeURIComponent(cfg.model)}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "cf-aig-authorization": `Bearer ${cfg.gatewayToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  let payload: any = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch {}

  if (!response.ok) {
    const message = payload?.error?.message
      || payload?.errors?.[0]?.message
      || payload?.message
      || raw
      || `Vertex AI trả HTTP ${response.status}`;
    const error = new Error(clean(message));
    (error as any).status = response.status;
    (error as any).payload = payload;
    throw error;
  }

  return payload;
}

export async function checkVertexHealth(): Promise<VertexHealthResult> {
  let env: RuntimeEnv;
  try {
    env = await runtime();
  } catch (error) {
    return {
      ok: false,
      config: { gateway: false, token: false, project: false, location: "global", model: "gemini-3.5-flash" },
      httpCode: null,
      error: "ENV_UNAVAILABLE",
      message: clean(error instanceof Error ? error.message : error),
    };
  }

  const configState = {
    gateway: Boolean(String(env.CLOUDFLARE_ACCOUNT_ID || "").trim() && String(env.CF_AI_GATEWAY_ID || "gemini-gateway").trim()),
    token: Boolean(String(env.CF_AI_GATEWAY_TOKEN || "").trim()),
    project: Boolean(String(env.GCP_PROJECT_ID || "").trim()),
    location: String(env.VERTEX_AI_LOCATION || "global").trim(),
    model: String(env.VERTEX_AI_MODEL || "gemini-3.5-flash").trim(),
  };

  if (!configState.gateway || !configState.token || !configState.project) {
    const missing = [
      !configState.gateway && "gateway",
      !configState.token && "gateway token",
      !configState.project && "GCP project",
    ].filter(Boolean).join(", ");
    return {
      ok: false,
      config: configState,
      httpCode: null,
      error: "AI_CONFIG_INCOMPLETE",
      message: `Thiếu cấu hình: ${missing}.`,
    };
  }

  try {
    const payload = await generateVertexContent({
      contents: [{ role: "user", parts: [{ text: "Reply only OK." }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 16 },
    });
    const text = payload?.candidates?.[0]?.content?.parts
      ?.map((part: any) => typeof part?.text === "string" ? part.text : "")
      .join("")
      .trim();

    return {
      ok: Boolean(text),
      config: configState,
      httpCode: 200,
      error: text ? null : "UNEXPECTED_RESPONSE",
      message: text ? "Vertex AI Gateway hoạt động." : "Vertex trả 200 nhưng không có text trong candidates.",
    };
  } catch (error) {
    return {
      ok: false,
      config: configState,
      httpCode: Number((error as any)?.status || 0) || null,
      error: "VERTEX_REQUEST_FAILED",
      message: clean(error instanceof Error ? error.message : error),
    };
  }
}
