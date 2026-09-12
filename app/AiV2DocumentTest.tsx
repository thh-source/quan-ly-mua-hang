"use client";

import { useRef, useState } from "react";
import "./ai-v2-document-test.css";

type TestResult = {
  ok?: boolean;
  file?: { name: string; mimeType: string; sizeBytes: number; kind: string };
  parser?: string;
  metadata?: Record<string, unknown>;
  extractedTextLength?: number;
  preview?: string | null;
  multimodalBytesReady?: boolean;
  error?: string;
  code?: string;
  message?: string;
};

type ProviderHealthResult = {
  ok?: boolean;
  code?: string;
  message?: string;
  configured?: Record<string, boolean | string>;
  health?: { ok?: boolean; provider?: string; model?: string; message?: string };
};

const CHUNK_SIZE = 384 * 1024;
const MAX_FILE_SIZE = 20 * 1024 * 1024;

function formatBytes(value = 0) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

async function parseJson(response: Response) {
  const text = await response.text();
  let data: TestResult = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok || !data.ok) {
    throw new Error(data.message || data.error || text || `Lỗi máy chủ (${response.status})`);
  }
  return data;
}

export default function AiV2DocumentTest() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState("");
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerHealth, setProviderHealth] = useState<ProviderHealthResult | null>(null);

  const runProviderHealth = async () => {
    if (providerBusy) return;
    setProviderBusy(true);
    setProviderHealth(null);
    try {
      const response = await fetch("/api/ai-v2/health", { cache: "no-store" });
      const text = await response.text();
      let data: ProviderHealthResult = {};
      try { data = text ? JSON.parse(text) : {}; } catch {}
      if (!data.message && !data.health?.message && text && !data.ok) data.message = text;
      setProviderHealth(data);
    } catch (cause) {
      setProviderHealth({ ok: false, code: "NETWORK_ERROR", message: cause instanceof Error ? cause.message : "Không thể kiểm tra AI provider." });
    } finally {
      setProviderBusy(false);
    }
  };

  const runTest = async () => {
    if (!file || busy) return;
    if (file.size > MAX_FILE_SIZE) {
      setError("File tối đa 20 MB.");
      return;
    }

    setBusy(true);
    setProgress(0);
    setError("");
    setResult(null);
    try {
      const uploadId = crypto.randomUUID();
      const chunkCount = Math.ceil(file.size / CHUNK_SIZE);

      for (let index = 0; index < chunkCount; index++) {
        const chunk = file.slice(index * CHUNK_SIZE, Math.min(file.size, (index + 1) * CHUNK_SIZE));
        const response = await fetch(`/api/ai-v2/upload-chunk?uploadId=${encodeURIComponent(uploadId)}&index=${index}`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: chunk,
        });
        const text = await response.text();
        let data: { ok?: boolean; error?: string } = {};
        try { data = text ? JSON.parse(text) : {}; } catch {}
        if (!response.ok || !data.ok) throw new Error(data.error || text || `Lỗi upload (${response.status})`);
        setProgress(Math.round(((index + 1) / chunkCount) * 80));
      }

      const response = await fetch("/api/ai-v2/document-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId,
          chunkCount,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "application/octet-stream",
        }),
      });
      setProgress(90);
      const data = await parseJson(response);
      setResult(data);
      setProgress(100);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể kiểm tra tài liệu.");
    } finally {
      setBusy(false);
    }
  };

  return <>
    <button className="ai-v2-test-launch" type="button" onClick={() => setOpen(true)} title="Kiểm tra parser tài liệu AI v2">
      AI v2 test
    </button>

    {open && <div className="ai-v2-test-backdrop" onMouseDown={() => !busy && setOpen(false)}>
      <section className="ai-v2-test-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span>AI V2 · DOCUMENT PIPELINE</span>
            <h2>Kiểm tra AI v2</h2>
            <p>Parser tài liệu và kết nối AI provider được kiểm tra độc lập trước khi bật tạo PR bằng AI.</p>
          </div>
          <button type="button" className="ai-v2-test-close" onClick={() => !busy && setOpen(false)}>×</button>
        </header>

        <section className="ai-v2-provider-box">
          <div>
            <b>AI provider</b>
            <small>Vertex AI qua Cloudflare AI Gateway</small>
          </div>
          <button type="button" className="ghost" onClick={() => void runProviderHealth()} disabled={providerBusy}>
            {providerBusy ? "Đang kiểm tra..." : "Kiểm tra kết nối AI"}
          </button>
        </section>

        {providerHealth && <div className={providerHealth.ok ? "ai-v2-test-ready" : "ai-v2-test-error"}>
          <strong>{providerHealth.ok ? "✓ AI provider hoạt động" : `✕ ${providerHealth.code || "AI chưa sẵn sàng"}`}</strong>
          <div>{providerHealth.health?.message || providerHealth.message || "Không có chi tiết."}</div>
          {providerHealth.configured && <pre className="ai-v2-provider-config">{JSON.stringify(providerHealth.configured, null, 2)}</pre>}
        </div>}

        <input
          ref={inputRef}
          hidden
          type="file"
          accept=".xlsx,.xls,.docx,.pdf,.png,.jpg,.jpeg,.webp"
          onChange={(event) => {
            const next = event.target.files?.[0] || null;
            setFile(next);
            setResult(null);
            setProgress(0);
            setError(next && next.size > MAX_FILE_SIZE ? "File tối đa 20 MB." : "");
          }}
        />

        <button type="button" className="ai-v2-test-drop" onClick={() => inputRef.current?.click()} disabled={busy}>
          <strong>{file ? file.name : "Chọn Excel / Word / PDF / ảnh"}</strong>
          <small>{file ? formatBytes(file.size) : "XLSX · XLS · DOCX · PDF · PNG · JPG · WEBP"}</small>
        </button>

        <div className="ai-v2-test-actions">
          <button type="button" className="ghost" onClick={() => setOpen(false)} disabled={busy}>Đóng</button>
          <button type="button" className="primary" onClick={() => void runTest()} disabled={!file || busy || file.size > MAX_FILE_SIZE}>
            {busy ? `Đang kiểm tra... ${progress}%` : "Kiểm tra parser"}
          </button>
        </div>

        {error && <div className="ai-v2-test-error">{error}</div>}

        {result?.ok && <div className="ai-v2-test-result">
          <div className="ai-v2-test-grid">
            <article><span>Loại tài liệu</span><b>{result.file?.kind || "-"}</b></article>
            <article><span>Parser</span><b>{result.parser || "-"}</b></article>
            <article><span>Kích thước</span><b>{formatBytes(result.file?.sizeBytes)}</b></article>
            <article><span>Text trích xuất</span><b>{(result.extractedTextLength || 0).toLocaleString("vi-VN")} ký tự</b></article>
          </div>

          {(result.file?.kind === "pdf" || result.file?.kind === "image") && <div className={result.multimodalBytesReady ? "ai-v2-test-ready" : "ai-v2-test-warning"}>
            {result.multimodalBytesReady ? "✓ Bytes đã sẵn sàng cho luồng multimodal." : "⚠ Chưa có bytes cho multimodal."}
          </div>}

          <details open>
            <summary>Metadata</summary>
            <pre>{JSON.stringify(result.metadata || {}, null, 2)}</pre>
          </details>

          <details open={Boolean(result.preview)}>
            <summary>Preview nội dung</summary>
            <pre>{result.preview || "File này không trích text ở bước parser. Sẽ được xử lý multimodal ở bước AI provider."}</pre>
          </details>
        </div>}
      </section>
    </div>}
  </>;
}
