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

function formatBytes(value = 0) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export default function AiV2DocumentTest() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState("");

  const runTest = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/ai-v2/document-test", { method: "POST", body: form });
      const text = await response.text();
      let data: TestResult = {};
      try { data = text ? JSON.parse(text) : {}; } catch {}
      if (!response.ok || !data.ok) {
        throw new Error(data.message || data.error || text || `Lỗi máy chủ (${response.status})`);
      }
      setResult(data);
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
            <h2>Kiểm tra parser tài liệu</h2>
            <p>Chỉ đọc và phân tích file. Không gọi AI, không ghi D1, không tạo PR.</p>
          </div>
          <button type="button" className="ai-v2-test-close" onClick={() => !busy && setOpen(false)}>×</button>
        </header>

        <input
          ref={inputRef}
          hidden
          type="file"
          accept=".xlsx,.xls,.docx,.pdf,.png,.jpg,.jpeg,.webp"
          onChange={(event) => {
            setFile(event.target.files?.[0] || null);
            setResult(null);
            setError("");
          }}
        />

        <button type="button" className="ai-v2-test-drop" onClick={() => inputRef.current?.click()} disabled={busy}>
          <strong>{file ? file.name : "Chọn Excel / Word / PDF / ảnh"}</strong>
          <small>{file ? formatBytes(file.size) : "XLSX · XLS · DOCX · PDF · PNG · JPG · WEBP"}</small>
        </button>

        <div className="ai-v2-test-actions">
          <button type="button" className="ghost" onClick={() => setOpen(false)} disabled={busy}>Đóng</button>
          <button type="button" className="primary" onClick={() => void runTest()} disabled={!file || busy}>
            {busy ? "Đang kiểm tra..." : "Kiểm tra parser"}
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
