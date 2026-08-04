"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";

type DocumentFile = {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  documentType?: string;
  expiresAt?: string;
  status?: string;
  note?: string;
};

const DOC_TYPES = [
  "Báo giá",
  "Hợp đồng",
  "PO xác nhận",
  "Hóa đơn",
  "Biên bản giao nhận",
  "Hồ sơ thanh toán",
  "CO/CQ",
  "Khác",
];
const DOC_STATUSES = ["Đã nhận", "Còn thiếu", "Chờ bổ sung", "Hết hiệu lực"];
const fmtSize = (size: number) => {
  if (!size) return "0 KB";
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};
const dateVN = (value?: string) =>
  value ? new Intl.DateTimeFormat("vi-VN").format(new Date(value)) : "—";
const daysLeft = (value?: string) => {
  if (!value) return null;
  return Math.ceil(
    (new Date(`${value}T00:00:00`).getTime() - Date.now()) / 86_400_000,
  );
};

export default function DocumentManager({
  title = "Hồ sơ đính kèm",
  entityType,
  entityId,
  workspaceId,
  readOnly = false,
  onStatus,
}: {
  title?: string;
  entityType: "pr" | "po" | "contract" | "quote";
  entityId: string;
  workspaceId: string;
  readOnly?: boolean;
  onStatus?: (message: string) => void;
}) {
  const [files, setFiles] = useState<DocumentFile[]>([]),
    [loading, setLoading] = useState(false),
    [uploading, setUploading] = useState(false),
    [documentType, setDocumentType] = useState(DOC_TYPES[0]),
    [status, setStatus] = useState(DOC_STATUSES[0]),
    [expiresAt, setExpiresAt] = useState(""),
    [note, setNote] = useState("");
  const storageUsed = useMemo(
    () => files.reduce((total, file) => total + Number(file.size || 0), 0),
    [files],
  );
  const loadFiles = useCallback(() => {
    if (!workspaceId || !entityId || readOnly) return;
    setLoading(true);
    fetch(
      `/api/files?workspace=${encodeURIComponent(workspaceId)}&entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
    )
      .then((response) => {
        if (!response.ok) throw new Error("LOAD_FAILED");
        return response.json();
      })
      .then((body) => setFiles(body.files || []))
      .catch(() => onStatus?.("Không tải được danh sách hồ sơ"))
      .finally(() => setLoading(false));
  }, [entityId, entityType, onStatus, readOnly, workspaceId]);

  useEffect(() => {
    const timer = window.setTimeout(loadFiles, 0);
    return () => window.clearTimeout(timer);
  }, [loadFiles]);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    onStatus?.(`Đang tải hồ sơ ${file.name}...`);
    const form = new FormData();
    form.append("file", file);
    form.append("entityType", entityType);
    form.append("entityId", entityId);
    form.append("workspaceId", workspaceId);
    form.append("documentType", documentType);
    form.append("status", status);
    form.append("expiresAt", expiresAt);
    form.append("note", note);
    try {
      const response = await fetch("/api/files", { method: "POST", body: form });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "UPLOAD_FAILED");
      }
      onStatus?.(`Đã lưu hồ sơ ${file.name}`);
      setNote("");
      event.target.value = "";
      loadFiles();
    } catch (error) {
      onStatus?.(error instanceof Error ? error.message : "Tải hồ sơ thất bại");
    } finally {
      setUploading(false);
    }
  };
  const removeFile = async (id: string) => {
    if (!confirm("Xóa hồ sơ này khỏi kho lưu trữ?")) return;
    try {
      const response = await fetch(`/api/files/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error();
      setFiles((current) => current.filter((file) => file.id !== id));
      onStatus?.("Đã xóa hồ sơ");
    } catch {
      onStatus?.("Không xóa được hồ sơ");
    }
  };
  if (!workspaceId || !entityId || entityId === "0") return null;
  return (
    <section className="document-manager">
      <div className="document-head">
        <div>
          <span>HỒ SƠ LƯU TRỮ</span>
          <h2>{title}</h2>
          <p>
            {files.length} file · {fmtSize(storageUsed)} đã dùng trong mục này
          </p>
        </div>
        {!readOnly && (
          <label className={uploading ? "uploading" : ""}>
            ⇧ Tải hồ sơ
            <input
              type="file"
              hidden
              accept=".xlsx,.xls,.pdf,.doc,.docx,.jpg,.jpeg,.png"
              disabled={uploading}
              onChange={upload}
            />
          </label>
        )}
      </div>
      {!readOnly && (
        <div className="document-controls">
          <label>
            Loại hồ sơ
            <select
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value)}
            >
              {DOC_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            Trạng thái
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {DOC_STATUSES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Hạn hiệu lực / hạn bổ sung
            <input
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          </label>
          <label className="document-note">
            Ghi chú
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ví dụ: bản scan ký đóng dấu, thiếu trang..."
            />
          </label>
        </div>
      )}
      <div className="document-list">
        {loading ? (
          <p>Đang tải danh sách hồ sơ...</p>
        ) : files.length ? (
          files.map((file) => {
            const left = daysLeft(file.expiresAt);
            return (
              <article key={file.id}>
                <i>▧</i>
                <div>
                  <a href={`/api/files/${encodeURIComponent(file.id)}`} target="_blank">
                    {file.fileName}
                  </a>
                  <p>
                    {file.documentType || "Hồ sơ"} · {fmtSize(file.size)} · tải lên{" "}
                    {dateVN(file.uploadedAt)}
                  </p>
                  {file.note && <small>{file.note}</small>}
                </div>
                <span className={file.status === "Đã nhận" ? "ok" : "missing"}>
                  {file.status || "Đã nhận"}
                </span>
                {left !== null && (
                  <b className={left <= 7 ? "due-soon" : ""}>
                    {left < 0 ? "Đã quá hạn" : `Còn ${left} ngày`}
                  </b>
                )}
                {!readOnly && (
                  <button onClick={() => removeFile(file.id)} title="Xóa hồ sơ">
                    ×
                  </button>
                )}
              </article>
            );
          })
        ) : (
          <p>Chưa có hồ sơ nào được tải lên cho mục này.</p>
        )}
      </div>
    </section>
  );
}
