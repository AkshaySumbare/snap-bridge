import { config } from "../../config.js";

export interface TextChunk {
  text: string;
  chunkIndex: number;
  pageNumber?: number;
}

/**
 * Character-based chunking with overlap.
 * ~800 chars ≈ 200 tokens; overlap preserves context across chunk boundaries.
 */
export function chunkText(
  text: string,
  options?: { chunkSize?: number; overlap?: number },
): TextChunk[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const chunkSize = options?.chunkSize ?? config.vaultChunkSize;
  const overlap = options?.overlap ?? config.vaultChunkOverlap;

  if (normalized.length <= chunkSize) {
    return [{ text: normalized, chunkIndex: 0 }];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    const slice = normalized.slice(start, end).trim();
    if (slice) {
      chunks.push({ text: slice, chunkIndex });
      chunkIndex += 1;
    }
    if (end >= normalized.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}
