type Step = {
  step: string;
  status: "ok" | "error" | "skipped";
  httpCode: number | null;
  error: string | null;
  message: string;
};

const DIRECT_BASE = "https://generativelanguage.googleapis.com/v1beta";
const json = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
});

export async function GET() {
  let env: {
    GEMINI_API_KEY?: string;
    GEMINI_PR_MODEL?: string;
    CLOUDFLARE_ACCOUNT_ID?: string;
    CF_AI_GATEWAY_ID?: string;
    CF_AI_GATEWAY_TOKEN?: string;
  };
  try {
    env = (await import("cloudflare:workers")).env as unknown as typeof env;
  } catch {
    return json({ status: "error", error: "ENV_UNAVAILABLE" }, 503);
  }

  const key = String(env.GEMINI_API_KEY || "").trim();
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const gatewayId = String(env.CF_AI_GATEWAY_ID || "").trim();
  const gatewayToken = String(env.CF_AI_GATEWAY_TOKEN || "").trim();
  const gatewayConfigured = Boolean(accountId && gatewayId);
  const gatewayAuthConfigured = Boolean(gatewayToken);
  const gatewayBase = gatewayConfigured
    ? `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(accountId)}/${encodeURIComponent(gatewayId)}/google-ai-studio/v1beta`
    : "";

  const clean = (value: string) => {
    let text = value;
    for (const secret of [key, gatewayToken].filter(Boolean)) {
      for (const candidate of [secret, encodeURIComponent(secret)]) {
        text = text.split(candidate).join("[REDACTED]");
      }
    }
    if (accountId) text = text.split(accountId).join("[ACCOUNT_ID]");
    if (gatewayId) text = text.split(gatewayId).join("[GATEWAY_ID]");
    return text.replace(/AIza[\w-]+/g, "[REDACTED]").replace(/\s+/g, " ").slice(0, 420);
  };

  const model = String(env.GEMINI_PR_MODEL || "").trim().replace(/^models\//, "") || "gemini-2.5-flash";
  const steps: Step[] = [{
    step: "api_key",
    status: key ? "ok" : "error",
    httpCode: null,
    error: key ? null : "MISSING_API_KEY",
    message: key ? "API key đã được cấu hình." : "Chưa cấu hình GEMINI_API_KEY.",
  }, {
    step: "gateway_config",
    status: gatewayConfigured ? "ok" : "error",
    httpCode: null,
    error: gatewayConfigured ? null : "MISSING_GATEWAY_CONFIG",
    message: gatewayConfigured ? "AI Gateway đã được cấu hình." : "Thiếu CLOUDFLARE_ACCOUNT_ID hoặc CF_AI_GATEWAY_ID.",
  }, {
    step: "gateway_token",
    status: gatewayAuthConfigured ? "ok" : "error",
    httpCode: null,
    error: gatewayAuthConfigured ? null : "MISSING_GATEWAY_TOKEN",
    message: gatewayAuthConfigured ? "AI Gateway token đã được cấu hình." : "Thiếu CF_AI_GATEWAY_TOKEN.",
  }];

  async function probe(step: string, url: string, options: RequestInit = {}): Promise<Step> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const httpCode = response.status;
      const raw = await response.text();
      let payload: any = null;
      try { payload = raw ? JSON.parse(raw) : null; } catch {}

      if (!response.ok) {
        const errStatus = payload?.error?.status || payload?.errors?.[0]?.code || payload?.error?.[0]?.code || `HTTP_${httpCode}`;
        const errMessage = payload?.error?.message || payload?.errors?.[0]?.message || payload?.error?.[0]?.message || raw || `HTTP ${httpCode}.`;
        return { step, status: "error", httpCode, error: clean(String(errStatus)), message: clean(String(errMessage)) };
      }

      if (step === "google_connectivity") {
        return { step, status: "ok", httpCode, error: null, message: "Kết nối HTTPS ra Internet hoạt động." };
      }
      if (step.includes("models")) {
        const valid = Array.isArray(payload?.models);
        return { step, status: valid ? "ok" : "error", httpCode, error: valid ? null : "UNEXPECTED_RESPONSE", message: valid ? `Đọc được danh sách ${payload.models.length} model.` : "HTTP thành công nhưng phản hồi không có danh sách models." };
      }
      const valid = payload?.candidates?.some((candidate: any) => candidate?.content?.parts?.some((part: any) => typeof part?.text === "string" && part.text.trim()));
      return { step, status: valid ? "ok" : "error", httpCode, error: valid ? null : "UNEXPECTED_RESPONSE", message: valid ? "Text generation thành công." : "HTTP thành công nhưng không có text trong candidates." };
    } catch (error) {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      return {
        step,
        status: "error",
        httpCode: null,
        error: controller.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR",
        message: clean(controller.signal.aborted ? `Quá thời gian chờ 15 giây. ${detail}` : detail),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  const geminiHeaders = key ? { "x-goog-api-key": key } : {};
  const gatewayHeaders = {
    ...geminiHeaders,
    ...(gatewayToken ? { "cf-aig-authorization": `Bearer ${gatewayToken}` } : {}),
  };
  const directGenerateOptions: RequestInit = {
    method: "POST",
    headers: { ...geminiHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "Reply only OK." }] }],
      generationConfig: { maxOutputTokens: 32, temperature: 0 },
    }),
  };
  const gatewayGenerateOptions: RequestInit = {
    ...directGenerateOptions,
    headers: { ...gatewayHeaders, "Content-Type": "application/json" },
  };

  steps.push(await probe("google_connectivity", "https://www.google.com/generate_204"));

  if (!key) {
    for (const step of ["direct_models", "direct_generate_content", "gateway_models", "gateway_generate_content"])
      steps.push({ step, status: "skipped", httpCode: null, error: null, message: "Bỏ qua vì thiếu API key." });
  } else {
    steps.push(await probe("direct_models", `${DIRECT_BASE}/models`, { headers: geminiHeaders }));
    steps.push(await probe("direct_generate_content", `${DIRECT_BASE}/models/${encodeURIComponent(model)}:generateContent`, directGenerateOptions));

    if (gatewayConfigured && gatewayAuthConfigured) {
      steps.push(await probe("gateway_models", `${gatewayBase}/models`, { headers: gatewayHeaders }));
      steps.push(await probe("gateway_generate_content", `${gatewayBase}/models/${encodeURIComponent(model)}:generateContent`, gatewayGenerateOptions));
    } else {
      for (const step of ["gateway_models", "gateway_generate_content"])
        steps.push({ step, status: "skipped", httpCode: null, error: null, message: gatewayConfigured ? "Bỏ qua vì thiếu CF_AI_GATEWAY_TOKEN." : "Bỏ qua vì chưa cấu hình AI Gateway." });
    }
  }

  const hints = new Set<string>();
  const byStep = Object.fromEntries(steps.map(step => [step.step, step]));
  if (!gatewayConfigured) hints.add("Tạo AI Gateway rồi thêm CLOUDFLARE_ACCOUNT_ID và CF_AI_GATEWAY_ID vào Runtime variables.");
  if (gatewayConfigured && !gatewayAuthConfigured) hints.add("Thêm CF_AI_GATEWAY_TOKEN dạng Secret để xác thực AI Gateway.");
  if (byStep.direct_generate_content?.message?.toLowerCase().includes("location") && byStep.gateway_generate_content?.status === "ok")
    hints.add("AI Gateway đã tránh được lỗi location của đường gọi trực tiếp. Có thể dùng Gateway cho AI Import PR.");
  if (byStep.direct_generate_content?.message?.toLowerCase().includes("location") && byStep.gateway_generate_content?.message?.toLowerCase().includes("location"))
    hints.add("Cả direct và AI Gateway đều bị Google từ chối location; khi đó cần relay/Vertex AI ở region cố định.");
  if (byStep.gateway_generate_content?.httpCode === 401)
    hints.add("AI Gateway vẫn từ chối xác thực; kiểm tra CF_AI_GATEWAY_TOKEN và quyền AI Gateway: Run.");
  if (byStep.gateway_generate_content?.httpCode === 403)
    hints.add("AI Gateway nhận token nhưng token có thể thiếu quyền hoặc bị giới hạn resource.");

  return json({
    status: byStep.gateway_generate_content?.status === "ok" ? "ok" : "error",
    model: clean(model),
    gateway: { configured: gatewayConfigured, authenticated: gatewayAuthConfigured },
    steps,
    hints: [...hints],
  });
}
