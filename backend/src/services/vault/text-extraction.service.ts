import { createRequire } from "node:module";
import mammoth from "mammoth";
import Tesseract from "tesseract.js";
import { config } from "../../config.js";
import { AppError } from "../../utils/errors.js";
import type { DocumentSourceType } from "../../models/vault/Document.js";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>;

export function resolveSourceType(mimeType: string): DocumentSourceType {
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (mimeType.startsWith("image/")) return "image";
  throw new AppError(400, `Unsupported file type: ${mimeType}`);
}

export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
): Promise<{ text: string; sourceType: DocumentSourceType }> {
  const sourceType = resolveSourceType(mimeType);

  if (sourceType === "pdf") {
    const result = await pdfParse(buffer);
    return { text: result.text?.trim() ?? "", sourceType };
  }

  if (sourceType === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value?.trim() ?? "", sourceType };
  }

  if (sourceType === "image") {
    if (!config.vaultOcrEnabled) {
      return { text: "", sourceType: "screenshot" };
    }

    const {
      data: { text },
    } = await Tesseract.recognize(buffer, "eng");
    return { text: text?.trim() ?? "", sourceType: "screenshot" };
  }

  throw new AppError(400, `Cannot extract text from ${mimeType}`);
}

export async function downloadFileBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new AppError(502, `Failed to download file from storage (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
