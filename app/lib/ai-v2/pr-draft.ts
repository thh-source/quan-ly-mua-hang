import { AiServiceError, type PrDraft, type PrDraftItem } from "./contracts";

const MAX_ITEMS = 500;

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asFiniteNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function asConfidence(value: unknown) {
  return Math.min(1, Math.max(0, asFiniteNumber(value)));
}

function asWarnings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter(Boolean).slice(0, 50);
}

function normalizeItem(value: unknown): PrDraftItem {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    code: asString(item.code),
    category: asString(item.category),
    name: asString(item.name),
    description: asString(item.description ?? item.desc),
    specification: asString(item.specification ?? item.spec),
    unit: asString(item.unit),
    quantity: Math.max(0, asFiniteNumber(item.quantity ?? item.qty)),
    estimatedUnitPrice: Math.max(0, asFiniteNumber(item.estimatedUnitPrice ?? item.estimate)),
    confidence: asConfidence(item.confidence),
    warnings: asWarnings(item.warnings ?? (item.warning ? [item.warning] : [])),
  };
}

export function normalizePrDraft(value: unknown): PrDraft {
  if (!value || typeof value !== "object") {
    throw new AiServiceError("PR_DRAFT_INVALID", "AI response is not a PR draft object.");
  }

  const draft = value as Record<string, unknown>;
  const sourceItems = Array.isArray(draft.items) ? draft.items : [];
  if (sourceItems.length > MAX_ITEMS) {
    throw new AiServiceError("PR_DRAFT_INVALID", `PR draft exceeds ${MAX_ITEMS} items.`);
  }

  const items = sourceItems.map(normalizeItem).filter((item) => {
    return Boolean(item.name || item.description || item.specification || item.code);
  });

  if (!items.length) {
    throw new AiServiceError("PR_DRAFT_INVALID", "AI response contains no usable PR items.");
  }

  return {
    number: asString(draft.number),
    date: asString(draft.date),
    department: asString(draft.department),
    purpose: asString(draft.purpose),
    overallConfidence: asConfidence(draft.overallConfidence),
    warnings: asWarnings(draft.warnings),
    items,
  };
}

export const prDraftJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["number", "date", "department", "purpose", "overallConfidence", "warnings", "items"],
  properties: {
    number: { type: "string" },
    date: { type: "string" },
    department: { type: "string" },
    purpose: { type: "string" },
    overallConfidence: { type: "number", minimum: 0, maximum: 1 },
    warnings: { type: "array", items: { type: "string" } },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "category", "name", "description", "specification", "unit", "quantity", "estimatedUnitPrice", "confidence", "warnings"],
        properties: {
          code: { type: "string" },
          category: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          specification: { type: "string" },
          unit: { type: "string" },
          quantity: { type: "number", minimum: 0 },
          estimatedUnitPrice: { type: "number", minimum: 0 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          warnings: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;
