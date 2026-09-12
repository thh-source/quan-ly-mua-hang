import { AiServiceError, type AiDocumentInput, type SupportedDocumentKind } from "./contracts";

export const AI_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

const MIME_KIND: Record<string, SupportedDocumentKind> = {
  "application/pdf": "pdf",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "word",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "excel",
  "application/vnd.ms-excel": "excel",
};

const EXT_KIND: Record<string, SupportedDocumentKind> = {
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  docx: "word",
  xlsx: "excel",
  xls: "excel",
};

function extension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

export function classifyDocument(fileName: string, mimeType: string): SupportedDocumentKind {
  const kind = MIME_KIND[mimeType] || EXT_KIND[extension(fileName)];
  if (!kind) throw new AiServiceError("DOCUMENT_UNSUPPORTED", "Unsupported procurement document type.");
  return kind;
}

export function createDocumentInput(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  bytes?: Uint8Array;
  extractedText?: string;
}): AiDocumentInput {
  if (input.sizeBytes <= 0) throw new AiServiceError("DOCUMENT_PARSE_FAILED", "Document is empty.");
  if (input.sizeBytes > AI_DOCUMENT_MAX_BYTES) {
    throw new AiServiceError("DOCUMENT_TOO_LARGE", "Document exceeds the configured AI size limit.");
  }

  return {
    id: crypto.randomUUID(),
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    kind: classifyDocument(input.fileName, input.mimeType),
    bytes: input.bytes,
    extractedText: input.extractedText,
  };
}
