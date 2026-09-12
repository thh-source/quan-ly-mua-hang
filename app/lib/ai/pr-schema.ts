export type PRDraftItem = {
  code: string;
  category: string;
  name: string;
  desc: string;
  spec: string;
  unit: string;
  qty: number;
  estimate: number;
  confidence: number;
  warning: string;
};

export type PRDraft = {
  number: string;
  date: string;
  department: string;
  purpose: string;
  overallConfidence: number;
  warnings: string[];
  items: PRDraftItem[];
};

export const PR_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    number: {type: "string"},
    date: {type: "string", description: "YYYY-MM-DD nếu xác định được, nếu không để trống"},
    department: {type: "string"},
    purpose: {type: "string"},
    overallConfidence: {type: "number", minimum: 0, maximum: 1},
    warnings: {type: "array", items: {type: "string"}},
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: {type: "string"},
          category: {type: "string"},
          name: {type: "string"},
          desc: {type: "string"},
          spec: {type: "string"},
          unit: {type: "string"},
          qty: {type: "number", minimum: 0},
          estimate: {type: "number", minimum: 0},
          confidence: {type: "number", minimum: 0, maximum: 1},
          warning: {type: "string"},
        },
        required: ["code", "category", "name", "desc", "spec", "unit", "qty", "estimate", "confidence", "warning"],
      },
    },
  },
  required: ["number", "date", "department", "purpose", "overallConfidence", "warnings", "items"],
} as const;

const text = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const number = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const confidence = (value: unknown) => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0));

export function normalizePRDraft(value: any): PRDraft {
  const warnings = Array.isArray(value?.warnings) ? value.warnings.map(text).filter(Boolean) : [];
  const items = Array.isArray(value?.items) ? value.items.map((item: any): PRDraftItem => ({
    code: text(item?.code),
    category: text(item?.category),
    name: text(item?.name),
    desc: text(item?.desc),
    spec: text(item?.spec),
    unit: text(item?.unit),
    qty: number(item?.qty),
    estimate: number(item?.estimate),
    confidence: confidence(item?.confidence),
    warning: text(item?.warning),
  })).filter((item: PRDraftItem) => item.name || item.desc || item.spec || item.code) : [];

  for (const item of items) {
    if (!item.name) {
      item.warning = [item.warning, "Thiếu tên hàng; cần người dùng kiểm tra."].filter(Boolean).join(" ");
    }
    if (item.confidence < 0.6 && !item.warning) item.warning = "Độ tin cậy thấp; cần kiểm tra lại với tài liệu gốc.";
  }

  return {
    number: text(value?.number),
    date: /^\d{4}-\d{2}-\d{2}$/.test(text(value?.date)) ? text(value?.date) : "",
    department: text(value?.department),
    purpose: text(value?.purpose),
    overallConfidence: confidence(value?.overallConfidence),
    warnings,
    items,
  };
}
