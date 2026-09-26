/**
 * Translates a DOM text selection in the reader into a `ReaderSelection`.
 *
 * Paragraph body text is rendered as a variable number of styled `<span>`s
 * (highlights, terms, search matches all split it), so DOM offsets cannot be
 * used directly. We walk the paragraph's text nodes to convert (node, offset)
 * into a character offset into the paragraph's plain text — which is what
 * `Highlight.start/end` are expressed in.
 *
 * The paragraph element must contain body text and nothing else; clause
 * labels render as siblings so they never enter the offset arithmetic.
 */

import { useCallback } from "react";

import { useLiquidTextUiStore } from "../stores/liquid-text-ui-store";
import type { ReaderSelection } from "../types";

export const PARAGRAPH_ATTR = "data-paragraph-id";

function closestParagraph(node: Node | null): HTMLElement | null {
  let current: Node | null = node;
  while (current) {
    if (current instanceof HTMLElement && current.hasAttribute(PARAGRAPH_ATTR)) return current;
    current = current.parentNode;
  }
  return null;
}

/** Character offset of (node, offset) within `paragraph`'s text content. */
function offsetWithin(paragraph: HTMLElement, node: Node, offset: number): number {
  if (node === paragraph) {
    // Selection anchored at an element boundary — count whole children.
    let total = 0;
    for (let i = 0; i < offset && i < paragraph.childNodes.length; i += 1) {
      total += paragraph.childNodes[i]?.textContent?.length ?? 0;
    }
    return total;
  }

  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  let total = 0;
  let current = walker.nextNode();
  while (current) {
    if (current === node) return total + offset;
    total += current.textContent?.length ?? 0;
    current = walker.nextNode();
  }
  return total;
}

export function readSelection(): ReaderSelection | null {
  if (typeof window === "undefined") return null;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  const paragraph = closestParagraph(range.commonAncestorContainer);
  if (!paragraph) return null;

  const paragraphId = paragraph.getAttribute(PARAGRAPH_ATTR);
  const documentId = paragraph.getAttribute("data-document-id");
  const pageNumber = Number(paragraph.getAttribute("data-page-number"));
  if (!paragraphId || !documentId || !Number.isFinite(pageNumber)) return null;

  const rawStart = offsetWithin(paragraph, range.startContainer, range.startOffset);
  const rawEnd = offsetWithin(paragraph, range.endContainer, range.endOffset);
  const start = Math.min(rawStart, rawEnd);
  const end = Math.max(rawStart, rawEnd);
  if (end - start < 2) return null;

  const text = (paragraph.textContent ?? "").slice(start, end).trim();
  if (text.length === 0) return null;

  const rect = range.getBoundingClientRect();
  return {
    documentId,
    pageNumber,
    paragraphId,
    start,
    end,
    text,
    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
  };
}

/**
 * Handler for the reader's `mouseup` / `touchend`. Deferred by a frame so the
 * browser has finished settling the selection (Safari reports a collapsed
 * range if you read it synchronously from mouseup).
 */
export function useCaptureSelection() {
  const setSelection = useLiquidTextUiStore((state) => state.setSelection);

  return useCallback(() => {
    window.requestAnimationFrame(() => {
      setSelection(readSelection());
    });
  }, [setSelection]);
}
