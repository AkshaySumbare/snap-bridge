/**
 * Turns a paragraph's plain text into styled runs.
 *
 * Two independent layers can decorate the same characters — highlights and
 * the active search match — and they overlap freely. Rather than
 * reconciling interval trees, we mark each character
 * and then coalesce runs of identical marks. Paragraphs are a few hundred
 * characters, so the O(n) pass is cheaper than the bookkeeping would be.
 *
 * The reader relies on the output being a *complete, in-order* cover of the
 * paragraph: `use-text-selection` maps DOM offsets back to character offsets
 * by walking text nodes, which only works if no character is dropped.
 */

import type { Highlight, HighlightColor } from "../types";

export interface TextSegment {
  start: number;
  end: number;
  text: string;
  highlightId: string | null;
  color: HighlightColor | null;
  isSearchMatch: boolean;
}

interface CharMark {
  highlightId: string | null;
  color: HighlightColor | null;
  isSearchMatch: boolean;
}

const EMPTY_MARK: CharMark = {
  highlightId: null,
  color: null,
  isSearchMatch: false,
};

interface BuildSegmentsInput {
  text: string;
  paragraphId: string;
  highlights: readonly Highlight[];
  /** Case-insensitive needle for the search overlay; empty disables the layer. */
  searchQuery: string;
}

export function buildSegments({
  text,
  paragraphId,
  highlights,
  searchQuery,
}: BuildSegmentsInput): TextSegment[] {
  if (text.length === 0) return [];

  const marks: CharMark[] = Array.from({ length: text.length }, () => ({ ...EMPTY_MARK }));

  for (const highlight of highlights) {
    if (highlight.paragraphId !== paragraphId) continue;
    if (highlight.color === "clear") continue;
    const from = Math.max(0, highlight.start);
    const to = Math.min(text.length, highlight.end);
    for (let i = from; i < to; i += 1) {
      const mark = marks[i];
      if (!mark) continue;
      mark.highlightId = highlight.id;
      mark.color = highlight.color;
    }
  }

  if (searchQuery.trim().length > 0) {
    const needle = searchQuery.trim().toLowerCase();
    const haystack = text.toLowerCase();
    let from = haystack.indexOf(needle);
    while (from !== -1) {
      for (let i = from; i < from + needle.length; i += 1) {
        const mark = marks[i];
        if (mark) mark.isSearchMatch = true;
      }
      from = haystack.indexOf(needle, from + needle.length);
    }
  }

  // Coalesce runs of identical marks.
  const segments: TextSegment[] = [];
  let runStart = 0;
  for (let i = 1; i <= text.length; i += 1) {
    const previous = marks[i - 1];
    const current = i < text.length ? marks[i] : undefined;
    const sameRun =
      current !== undefined &&
      previous !== undefined &&
      current.highlightId === previous.highlightId &&
      current.color === previous.color &&
      current.isSearchMatch === previous.isSearchMatch;

    if (sameRun) continue;

    const mark = previous ?? EMPTY_MARK;
    segments.push({
      start: runStart,
      end: i,
      text: text.slice(runStart, i),
      highlightId: mark.highlightId,
      color: mark.color,
      isSearchMatch: mark.isSearchMatch,
    });
    runStart = i;
  }

  return segments;
}
