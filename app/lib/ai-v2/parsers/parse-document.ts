import { AiServiceError, type AiDocumentInput } from "../contracts";
import { createDocumentInput } from "../document";
import { parseExcelDocument } from "./excel";
import { parseDocxDocument } from "./docx";

export type ParsedDocument = {
  document: AiDocumentInput;
  parser: "excel" | "docx" | "multimodal-pass-through";
  metadata: Record<string, unknown>;
};

export function parseDocumentFile(input: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): ParsedDocument {
  const document = createDocumentInput({
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.bytes.byteLength,
    bytes: input.bytes,
  });

  if (document.kind === "excel") {
    const parsed = parseExcelDocument(input.bytes);
    return {
      document: { ...document, extractedText: parsed.extractedText, bytes: undefined },
      parser: "excel",
      metadata: parsed.metadata,
    };
  }

  if (document.kind === "word") {
    const parsed = parseDocxDocument(input.bytes);
    return {
      document: { ...document, extractedText: parsed.extractedText, bytes: undefined },
      parser: "docx",
      metadata: parsed.metadata,
    };
  }

  if (document.kind === "pdf" || document.kind === "image") {
    return {
      document,
      parser: "multimodal-pass-through",
      metadata: { byteLength: input.bytes.byteLength },
    };
  }

  throw new AiServiceError("DOCUMENT_UNSUPPORTED", "Unsupported document parser path.");
}
