import { AiServiceError, type AiDocumentInput, type AiProvider, type PrDraft } from "./contracts";
import { normalizePrDraft } from "./pr-draft";

const BASE_PROMPT = `Bạn là trợ lý mua hàng. Hãy đọc tài liệu đầu vào và chuyển thành bản nháp PR có cấu trúc.

Quy tắc bắt buộc:
- Không bịa dữ liệu.
- Không tự tạo mã hàng nếu tài liệu không có.
- Trường không chắc chắn để trống hoặc 0 và thêm cảnh báo.
- Chuẩn hóa ngày theo YYYY-MM-DD nếu có thể xác định chắc chắn.
- quantity và estimatedUnitPrice phải là số không âm.
- confidence nằm trong khoảng 0..1.
- Tách hợp lý tên hàng, mô tả kỹ thuật và quy cách.
- Chỉ trả JSON phù hợp schema nội bộ, không thêm markdown hay giải thích ngoài JSON.`;

export class AiPrService {
  constructor(private readonly provider: AiProvider) {}

  async healthCheck() {
    return this.provider.healthCheck();
  }

  async analyzeDocument(document: AiDocumentInput): Promise<PrDraft> {
    if (!document.fileName || !document.mimeType || document.sizeBytes <= 0) {
      throw new AiServiceError("DOCUMENT_PARSE_FAILED", "Document metadata is incomplete.");
    }

    const requestId = crypto.randomUUID();
    const result = await this.provider.analyze({
      requestId,
      document,
      prompt: BASE_PROMPT,
    });

    try {
      return normalizePrDraft(result.rawJson);
    } catch (error) {
      if (error instanceof AiServiceError) throw error;
      throw new AiServiceError("AI_INVALID_RESPONSE", "AI provider returned an invalid PR draft.", error);
    }
  }
}
