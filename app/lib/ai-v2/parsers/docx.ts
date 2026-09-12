import { inflateRawSync } from "node:zlib";
import { AiServiceError } from "../contracts";

const MAX_EXTRACTED_CHARS = 220_000;

function readU16(view: DataView, offset: number) {
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number) {
  return view.getUint32(offset, true);
}

function decodeUtf8(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function findEndOfCentralDirectory(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const min = Math.max(0, bytes.byteLength - 65_557);
  for (let offset = bytes.byteLength - 22; offset >= min; offset--) {
    if (readU32(view, offset) === 0x06054b50) return offset;
  }
  return -1;
}

function extractZipEntry(bytes: Uint8Array, wantedName: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(bytes);
  if (eocd < 0) throw new Error("ZIP end-of-central-directory not found");

  const entryCount = readU16(view, eocd + 10);
  let offset = readU32(view, eocd + 16);

  for (let index = 0; index < entryCount; index++) {
    if (readU32(view, offset) !== 0x02014b50) throw new Error("Invalid ZIP central directory");
    const compression = readU16(view, offset + 10);
    const compressedSize = readU32(view, offset + 20);
    const fileNameLength = readU16(view, offset + 28);
    const extraLength = readU16(view, offset + 30);
    const commentLength = readU16(view, offset + 32);
    const localHeaderOffset = readU32(view, offset + 42);
    const fileName = decodeUtf8(bytes.subarray(offset + 46, offset + 46 + fileNameLength));

    if (fileName === wantedName) {
      if (readU32(view, localHeaderOffset) !== 0x04034b50) throw new Error("Invalid ZIP local header");
      const localNameLength = readU16(view, localHeaderOffset + 26);
      const localExtraLength = readU16(view, localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
      if (compression === 0) return compressed;
      if (compression === 8) return new Uint8Array(inflateRawSync(compressed));
      throw new Error(`Unsupported DOCX compression method ${compression}`);
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  throw new Error(`${wantedName} not found in DOCX`);
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function xmlToReadableText(xml: string) {
  const withStructure = xml
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<w:br\b[^>]*\/>/g, "\n")
    .replace(/<\/w:tc>/g, "\t")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:p>/g, "\n");

  const textRuns = withStructure.replace(/<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g, "$1");
  const withoutTags = textRuns.replace(/<[^>]+>/g, "");
  return decodeXmlEntities(withoutTags)
    .replace(/\t+\n/g, "\n")
    .replace(/[ \t]{2,}/g, "\t")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseDocxDocument(bytes: Uint8Array) {
  try {
    const documentXml = decodeUtf8(extractZipEntry(bytes, "word/document.xml"));
    let extractedText = xmlToReadableText(documentXml);
    if (!extractedText) {
      throw new AiServiceError("DOCUMENT_PARSE_FAILED", "DOCX contains no readable text.");
    }
    const truncated = extractedText.length > MAX_EXTRACTED_CHARS;
    if (truncated) {
      extractedText = `${extractedText.slice(0, MAX_EXTRACTED_CHARS)}\n\n[TRUNCATED: DOCX content exceeded extraction limit]`;
    }
    return {
      extractedText,
      metadata: { truncated },
    };
  } catch (error) {
    if (error instanceof AiServiceError) throw error;
    throw new AiServiceError("DOCUMENT_PARSE_FAILED", "Unable to parse DOCX document.", error);
  }
}
