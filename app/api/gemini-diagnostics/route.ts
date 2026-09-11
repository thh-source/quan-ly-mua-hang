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
    return text.replace(/AIza[\w-]+/g, "[REDACTED]").replace(/\s+/g, " ").slice(0, 240);
  };
  const model = String(env.GEMINI_PR_MODEL || "").trim().replace(/^models\//, "") || "gemini-2.5-flash";
  const steps: Step[] = [{ step: "api_key", status: key ? "ok" : "error", httpCode: null,
    error: key ? null : "MISSING_API_KEY", message: key ? "API key đã được cấu hình." : "Chưa cấu hình GEMINI_API_KEY." }];

  async function probe(step: string, url: string, body?: unknown): Promise<Step> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let httpCode: number | null = null;
    try {
      const response = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: { "x-goog-api-key": key, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        redirect: "error",
      });
      httpCode = response.status;
      const payload = await response.json() as {
        error?: { status?: string; message?: string };
        models?: unknown[];
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      if (!response.ok) return { step, status: "error", httpCode,
        error: clean(typeof payload?.error?.status === "string" ? payload.error.status : "HTTP_ERROR"),
        message: clean(typeof payload?.error?.message === "string" ? payload.error.message : "Google trả về lỗi HTTP.") };
      const valid = step === "models" ? Array.isArray(payload?.models)
        : payload?.candidates?.some(candidate => candidate.content?.parts?.some(part => typeof part.text === "string" && part.text.trim()));
      return { step, status: valid ? "ok" : "error", httpCode,
        error: valid ? null : "UNEXPECTED_RESPONSE",
        message: valid ? "Yêu cầu thành công." : "HTTP thành công nhưng không có dữ liệu mong đợi." };
    } catch {
      return { step, status: "error", httpCode,
        error: controller.signal.aborted ? "TIMEOUT" : httpCode === null ? "NETWORK_ERROR" : "INVALID_RESPONSE",
        message: controller.signal.aborted ? "Quá thời gian chờ 15 giây." : httpCode === null ? "Không nhận được phản hồi HTTP từ Google." : "Không đọc được phản hồi JSON từ Google." };
    } finally {
      clearTimeout(timer);
    }
  }

  if (!key) {
    for (const step of ["models", "generate_content"]) steps.push({ step, status: "skipped", httpCode: null, error: null, message: "Bỏ qua vì thiếu API key." });
  } else {
    steps.push(await probe("models", `${BASE}/models`));
    // Run independently of the models result to compare the two API outcomes.
    steps.push(await probe("generate_content", `${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      contents: [{ parts: [{ text: "Reply only OK." }] }],
      generationConfig: { maxOutputTokens: 256 },
    }));
  }

  const hints = new Set<string>();
  for (const step of steps.filter(item => item.status === "error")) {
    const message = `${step.error} ${step.message}`.toLowerCase();
    if (step.error === "MISSING_API_KEY") hints.add("Cấu hình GEMINI_API_KEY trong Worker rồi thử lại.");
    else if (/location|region|country/.test(message)) hints.add("Google báo giới hạn location/region. Đối chiếu cùng key và model từ môi trường khác; kết quả này chưa xác nhận IP egress là nguyên nhân duy nhất.");
    else if (/api.?key|unauthenticated/.test(message) || step.httpCode === 401) hints.add("Kiểm tra API key còn hợp lệ, đúng project và các restriction của key.");
    else if (step.httpCode === 403) hints.add("Kiểm tra quyền, API đã bật, restriction và chính sách của project; HTTP 403 chưa đủ để kết luận key sai.");
    else if (step.httpCode === 404 || /model/.test(message)) hints.add("Kiểm tra GEMINI_PR_MODEL và khả năng hỗ trợ generateContent của model trong v1beta.");
    else if (step.httpCode === 429) hints.add("Kiểm tra quota, rate limit và billing của project.");
    else if (["NETWORK_ERROR", "TIMEOUT"].includes(step.error || "")) hints.add("Kiểm tra kết nối/egress hoặc thử lại; timeout không chứng minh lỗi location.");
    else hints.add("Kiểm tra HTTP code và thông báo từng bước; có thể do cấu hình project, phản hồi hoặc dịch vụ Google.");
  }
  if (steps.every(step => step.status === "ok")) hints.add("Key, danh sách model và text generation hoạt động ở lần thử này. Nếu nhập PR còn lỗi, kiểm tra riêng file/payload và logic nhập PR.");
  return json({ status: steps.every(step => step.status === "ok") ? "ok" : "error", model: clean(model), steps, hints: [...hints] });
}
