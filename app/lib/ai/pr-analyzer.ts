import {Buffer} from "node:buffer";
import {generateVertexContent} from "./vertex";
import {normalizePRDraft, PR_RESPONSE_SCHEMA, type PRDraft} from "./pr-schema";

const SYSTEM_PROMPT = `Bạn là trợ lý mua hàng. Nhiệm vụ của bạn là chuyển tài liệu đầu vào thành bản nháp PR chuẩn cho hệ thống mua hàng.

Quy tắc bắt buộc:
- Không bịa dữ liệu. Trường không chắc thì để trống hoặc 0 và ghi cảnh báo.
- Hiểu các cách gọi tương đương: SL/Qty/Khối lượng => qty; ĐVT/Unit => unit.
- Tách hợp lý Tên hàng, Mô tả kỹ thuật và Quy cách; giữ model, kích thước, vật liệu, tiêu chuẩn và thông số quan trọng.
- Nếu tài liệu có nhiều bảng/trang/sheet, hợp nhất các dòng hàng hóa liên quan; bỏ tiêu đề và dòng tổng cộng không phải hàng hóa.
- Không tự tạo mã hàng. Không thấy mã thì code để trống.
- estimate chỉ điền khi tài liệu thực sự có đơn giá/giá dự kiến.
- department và purpose chỉ suy ra khi có căn cứ rõ ràng.
- confidence và overallConfidence nằm trong khoảng 0..1.
- Ngày trả về YYYY-MM-DD nếu xác định được; nếu không để trống.
- Chỉ trả JSON theo schema, không thêm markdown.`;

export async function analyzePRFromText(fileName: string, content: string): Promise<PRDraft> {
  const payload = await generateVertexContent({
    contents: [{
      role: "user",
      parts: [{text: `${SYSTEM_PROMPT}\n\nTên file: ${fileName}\n\nNỘI DUNG TÀI LIỆU:\n${content}`}],
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: PR_RESPONSE_SCHEMA,
    },
  });
  return parseDraft(payload);
}

export async function analyzePRFromBinary(fileName: string, mimeType: string, bytes: ArrayBuffer): Promise<PRDraft> {
  const payload = await generateVertexContent({
    contents: [{
      role: "user",
      parts: [
        {inlineData: {mimeType, data: Buffer.from(bytes).toString("base64")}},
        {text: `${SYSTEM_PROMPT}\n\nTên file: ${fileName}`},
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: PR_RESPONSE_SCHEMA,
    },
  });
  return parseDraft(payload);
}

function parseDraft(payload: any): PRDraft {
  const raw = payload?.candidates?.[0]?.content?.parts
    ?.map((part: any) => typeof part?.text === "string" ? part.text : "")
    .join("")
    .trim();
  if (!raw) throw new Error("AI_EMPTY_RESPONSE");
  let parsed: any;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("AI_INVALID_JSON"); }
  return normalizePRDraft(parsed);
}
