/**
 * One paragraph of body text, with its highlight and search decoration.
 *
 * Always rendered at full size. Collapsing is not something a paragraph does
 * to itself — the reader folds the *gaps between* marked passages, which is
 * `CollapsedRegion`'s job — so this component stays purely about decoration
 * and keeps the character offsets that text selection depends on intact.
 */

import { cn } from "@/lib/utils";

import { HIGHLIGHT_STYLES } from "../constants";
import { PARAGRAPH_ATTR } from "../hooks/use-reader-selection";
import type { DocumentParagraph, Highlight } from "../types";
import { buildSegments } from "../utils/text-segments";

interface DocumentParagraphViewProps {
  paragraph: DocumentParagraph;
  documentId: string;
  pageNumber: number;
  highlights: readonly Highlight[];
  searchQuery: string;
  focused: boolean;
  onHighlightClick: (highlightId: string) => void;
}

export function DocumentParagraphView({
  paragraph,
  documentId,
  pageNumber,
  highlights,
  searchQuery,
  focused,
  onHighlightClick,
}: DocumentParagraphViewProps) {
  const paragraphHighlights = highlights.filter(
    (highlight) => highlight.paragraphId === paragraph.id,
  );

  const segments = buildSegments({
    text: paragraph.text,
    paragraphId: paragraph.id,
    highlights: paragraphHighlights,
    searchQuery,
  });

  const body = (
    <p
      {...{ [PARAGRAPH_ATTR]: paragraph.id }}
      data-document-id={documentId}
      data-page-number={pageNumber}
      className={cn(
        "select-text text-justify font-serif text-[13.5px] leading-[1.65] text-foreground",
        paragraph.heading && "text-center font-semibold",
      )}
    >
      {segments.map((segment) => {
        const highlightStyle = segment.color ? HIGHLIGHT_STYLES[segment.color] : null;
        const highlightId = segment.highlightId;
        return (
          <span
            key={`${paragraph.id}-${segment.start}`}
            {...(highlightId ? { "data-highlight-id": highlightId } : {})}
            onClick={
              highlightId
                ? (event) => {
                    event.stopPropagation();
                    onHighlightClick(highlightId);
                  }
                : undefined
            }
            className={cn(
              highlightStyle?.mark,
              highlightId && "cursor-pointer",
              segment.isSearchMatch &&
                "rounded-sm bg-status-warning/60 outline outline-1 outline-status-warning",
            )}
          >
            {segment.text}
          </span>
        );
      })}
    </p>
  );

  return (
    <div className={cn("relative", focused && "rounded-md ring-2 ring-primary/60")}>
      <div className="flex gap-2">
        {paragraph.label && (
          <span
            aria-hidden
            className={cn(
              "shrink-0 select-none font-serif text-[13.5px] font-semibold leading-[1.65] text-text-secondary",
              paragraph.indent === 1 && "ml-6",
              paragraph.indent === 2 && "ml-12",
            )}
          >
            {paragraph.label}
          </span>
        )}
        <span
          className={cn("min-w-0 flex-1", !paragraph.label && paragraph.indent === 1 && "ml-6")}
        >
          {body}
        </span>
      </div>
    </div>
  );
}
