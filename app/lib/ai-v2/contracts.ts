export type SupportedDocumentKind = "excel" | "word" | "pdf" | "image";

export type AiDocumentInput = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: SupportedDocumentKind;
  extractedText?: string;
  bytes?: Uint8Array;
};

export type PrDraftItem = {
  code: string;
  category: string;
  name: string;
  description: string;
  specification: string;
  unit: string;
  quantity: number;
  estimatedUnitPrice: number;
  confidence: number;
  warnings: string[];
};

export type PrDraft = {
  number: string;
  date: string;
  department: string;
  purpose: string;
  overallConfidence: number;
  warnings: string[];
  items: PrDraftItem[];
};

export type AiProviderRequest = {
  requestId: string;
  document: AiDocumentInput;
  prompt: string;
};

export type AiProviderResult = {
  provider: string;
  model: string;
  requestId: string;
  rawJson: unknown;
  durationMs: number;
};

export interface AiProvider {
  readonly name: string;
  healthCheck(): Promise<{ ok: boolean; provider: string; model?: string; message?: string }>;
  analyze(request: AiProviderRequest): Promise<AiProviderResult>;
}

export type AiErrorCode =
  | "AI_NOT_CONFIGURED"
  | "AI_AUTH_FAILED"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_TIMEOUT"
  | "AI_RATE_LIMITED"
  | "AI_INVALID_RESPONSE"
  | "DOCUMENT_UNSUPPORTED"
  | "DOCUMENT_TOO_LARGE"
  | "DOCUMENT_PARSE_FAILED"
  | "PR_DRAFT_INVALID";

export class AiServiceError extends Error {
  readonly code: AiErrorCode;
  readonly causeDetail?: unknown;

  constructor(code: AiErrorCode, message: string, causeDetail?: unknown) {
    super(message);
    this.name = "AiServiceError";
    this.code = code;
    this.causeDetail = causeDetail;
  }
}
