import { requireUser } from "../../auth";

type Step = {
  step: string;
  status: "ok" | "error" | "skipped";
  httpCode: number | null;
  error: string | null;
  message: string;
};

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const json = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
});

export async function GET() {
  try {
    await requireUser();
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === "UNAUTHORIZED";
    return json({ status: "error", error: unauthorized ? "UNAUTHORIZED" : "AUTH_UNAVAILABLE" }, unauthorized ? 401 : 503);
  }

  let env: { GEMINI_API_KEY?: string; GEMINI_PR_MODEL?: string };
  try {
    env = (await import("cloudflare:workers")).env as unknown as typeof env;
  } catch {
    return json({ status: "error", error: "ENV_UNAVAILABLE" }, 503);
  }

  const key = String(env.GEMINI_API_KEY || "").trim();
  const clean = (value: string) => {
    let text = value;
    if (key) {
      for (const secret of [key, encodeURIComponent(key)]) text = text.split(secret).join("[REDACTED]");
    }
    return text.replace(/AIza[\w-]+/g, "[REDACTED]").replace(/\s+/g, " ").slice(0, 320);
  };
  const model = String(env.GEMINI_PR_MODEL || "").trim().replace(/^models\//, "") || "gemini-2.5-flash";
  const steps: Step[] = [{
    step: "api_key",
    status: key ? "ok" : "error",
    httpCode: null,
    error: key ? null : "MISSING_API_KEY",
    message: key ? "API key đã được cấu hình." : "Chưa cấu hình GEMINI_API_KEY.",
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
        const errStatus = payload?.error?.status || `HTTP_${httpCode}`;
        const errMessage = payload?.error?.message || raw || `Google trả về HTTP ${httpCode}.`;
        return { step, status: "error", httpCode, error: clean(String(errStatus)), message: clean(String(errMessage)) };
      }

      if (step === "google_connectivity") {
        return { step, status: "ok", httpCode, error: null, message: "Kết nối HTTPS ra Internet hoạt động." };
      }
      if (step === "models") {
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

  if (!key) {
    for (const step of ["google_connectivity", "models", "generate_content"])
      steps.push({ step, status: "skipped", httpCode: null, error: null, message: "Bỏ qua vì thiếu API key." });
  } else {
    steps.push(await probe("google_connectivity", "https://www.google.com/generate_204"));
    steps.push(await probe("models", `${BASE}/models`, { headers: { "x-goog-api-key": key } }));
    steps.push(await probe("generate_content", `${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Reply only OK." }] }],
        generationConfig: { maxOutputTokens: 32, temperature: 0 },
      }),
    }));
  }

  const hints = new Set<string>();
  const byStep = Object.fromEntries(steps.map(step => [step.step, step]));
  if (byStep.google_connectivity?.status === "error") hints.add("Worker không ra được HTTPS bình thường; kiểm tra placement/egress trước khi kết luận lỗi Gemini.");
  if (byStep.google_connectivity?.status === "ok" && byStep.models?.status === "error" && byStep.models?.httpCode === null)
    hints.add("Internet chung hoạt động nhưng host Gemini không trả HTTP; nghiêng về DNS/TLS/egress tới generativelanguage.googleapis.com.");
  for (const step of steps.filter(item => item.status === "error")) {
    const message = `${step.error} ${step.message}`.toLowerCase();
    if (step.error === "MISSING_API_KEY") hints.add("Cấu hình GEMINI_API_KEY trong Worker rồi thử lại.");
    else if (/location|region|country/.test(message)) hints.add("Google đã trả HTTP và báo location/region; đây là lỗi phía Gemini/định tuyến vùng, không phải lỗi parse file.");
    else if (/api.?key|unauthenticated|invalid argument/.test(message) || step.httpCode === 401) hints.add("Kiểm tra API key, project và restriction của key.");
    else if (step.httpCode === 403) hints.add("Kiểm tra quyền API, restriction và chính sách project.");
    else if (step.httpCode === 404 || /model/.test(message)) hints.add("Kiểm tra GEMINI_PR_MODEL; model mặc định chẩn đoán là gemini-2.5-flash.");
    else if (step.httpCode === 429) hints.add("Kiểm tra quota/rate limit Free Tier.");
  }
  if (steps.every(step => step.status === "ok")) hints.add("API key, kết nối Google, danh sách model và text generation đều hoạt động. Nếu nhập PR còn lỗi thì lỗi nằm ở file/payload hoặc logic xử lý tài liệu.");

  return json({
    status: steps.every(step => step.status === "ok") ? "ok" : "error",
    model: clean(model),
    steps,
    hints: [...hints],
  });
}
