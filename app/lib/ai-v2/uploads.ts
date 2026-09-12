import { AI_DOCUMENT_MAX_BYTES } from "./document";
import { AiServiceError } from "./contracts";

export const AI_UPLOAD_MAX_CHUNKS = 80;

export type ChunkedUploadDescriptor = {
  uploadId: string;
  chunkCount: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
};

function validId(value: string) {
  return /^[a-zA-Z0-9_-]{8,80}$/.test(value);
}

export function parseChunkedUploadDescriptor(input: Record<string, unknown>): ChunkedUploadDescriptor {
  const descriptor = {
    uploadId: String(input.uploadId || ""),
    chunkCount: Number(input.chunkCount),
    fileName: String(input.fileName || ""),
    mimeType: String(input.mimeType || "application/octet-stream"),
    fileSize: Number(input.fileSize),
  };

  if (!validId(descriptor.uploadId) || !Number.isInteger(descriptor.chunkCount) || descriptor.chunkCount < 1 || descriptor.chunkCount > AI_UPLOAD_MAX_CHUNKS) {
    throw new AiServiceError("DOCUMENT_PARSE_FAILED", "Phiên tải file không hợp lệ.");
  }
  if (!descriptor.fileName || !Number.isFinite(descriptor.fileSize) || descriptor.fileSize <= 0) {
    throw new AiServiceError("DOCUMENT_PARSE_FAILED", "Metadata file không hợp lệ.");
  }
  if (descriptor.fileSize > AI_DOCUMENT_MAX_BYTES) {
    throw new AiServiceError("DOCUMENT_TOO_LARGE", "Document exceeds the configured AI size limit.");
  }
  return descriptor;
}

export async function readChunkedUpload(bucket: R2Bucket, userId: string, input: Record<string, unknown>) {
  const descriptor = parseChunkedUploadDescriptor(input);
  const chunks: Uint8Array[] = [];
  const keys: string[] = [];
  let total = 0;

  try {
    for (let index = 0; index < descriptor.chunkCount; index++) {
      const key = `ai-v2-temp/${userId}/${descriptor.uploadId}/${String(index).padStart(4, "0")}`;
      keys.push(key);
      const object = await bucket.get(key);
      if (!object) {
        throw new AiServiceError("DOCUMENT_PARSE_FAILED", `Thiếu chunk ${index + 1}/${descriptor.chunkCount}.`);
      }
      const bytes = new Uint8Array(await object.arrayBuffer());
      chunks.push(bytes);
      total += bytes.byteLength;
      if (total > AI_DOCUMENT_MAX_BYTES) {
        throw new AiServiceError("DOCUMENT_TOO_LARGE", "Document exceeds the configured AI size limit.");
      }
    }

    if (total !== descriptor.fileSize) {
      throw new AiServiceError("DOCUMENT_PARSE_FAILED", `Kích thước file không khớp (${total}/${descriptor.fileSize} bytes).`);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return {
      fileName: descriptor.fileName,
      mimeType: descriptor.mimeType,
      bytes,
    };
  } finally {
    await Promise.all(keys.map((key) => bucket.delete(key).catch(() => undefined)));
  }
}
