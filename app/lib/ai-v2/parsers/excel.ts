import * as XLSX from "xlsx";
import { AiServiceError } from "../contracts";

const MAX_EXTRACTED_CHARS = 220_000;
const MAX_SHEETS = 50;

function trimExtractedText(value: string) {
  const normalized = value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  if (normalized.length <= MAX_EXTRACTED_CHARS) return normalized;
  return `${normalized.slice(0, MAX_EXTRACTED_CHARS)}\n\n[TRUNCATED: Excel content exceeded extraction limit]`;
}

export function parseExcelDocument(bytes: Uint8Array) {
  try {
    const workbook = XLSX.read(bytes, {
      type: "array",
      cellDates: true,
      cellText: true,
      dense: false,
    });

    const sheetNames = workbook.SheetNames.slice(0, MAX_SHEETS);
    const sections: string[] = [];

    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const csv = XLSX.utils.sheet_to_csv(sheet, {
        blankrows: false,
        FS: "\t",
        RS: "\n",
      }).trim();
      if (!csv) continue;
      sections.push(`### SHEET: ${sheetName}\n${csv}`);
    }

    const text = trimExtractedText(sections.join("\n\n"));
    if (!text) {
      throw new AiServiceError("DOCUMENT_PARSE_FAILED", "Excel workbook contains no readable cells.");
    }

    return {
      extractedText: text,
      metadata: {
        sheetCount: workbook.SheetNames.length,
        parsedSheetCount: sheetNames.length,
        truncated: text.includes("[TRUNCATED:"),
      },
    };
  } catch (error) {
    if (error instanceof AiServiceError) throw error;
    throw new AiServiceError("DOCUMENT_PARSE_FAILED", "Unable to parse Excel workbook.", error);
  }
}
