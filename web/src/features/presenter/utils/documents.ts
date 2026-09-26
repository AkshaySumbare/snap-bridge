/**
 * Lookups that need to cross the document boundary.
 *
 * With several documents open in one scroll, a paragraph id is no longer
 * enough to know which document you are in — but the ink stroke, the attach
 * click and the passage link all resolve to a paragraph first and need the
 * document second.
 */

import type { LiquidDocument } from "../types";

export interface FoundParagraph {
  documentId: string;
  documentTitle: string;
  text: string;
}

/** The paragraph behind an anchor, with enough context to cite it. */
export function findParagraph(
  documents: readonly LiquidDocument[],
  paragraphId: string,
): FoundParagraph | null {
  for (const document of documents) {
    for (const page of document.pages) {
      for (const paragraph of page.paragraphs) {
        if (paragraph.id === paragraphId) {
          return { documentId: document.id, documentTitle: document.title, text: paragraph.text };
        }
      }
    }
  }
  return null;
}
