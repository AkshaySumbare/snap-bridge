/**
 * HighlightView — the document reduced to the passages the reader marked up,
 * in page order, with everything else dropped.
 *
 * This is the "pinch all the way" endpoint: instead of scaling the untouched
 * text down, it is removed entirely, so a 40-page agreement becomes a
 * one-screen review list.
 *
 * A reading view and nothing else. The passages carry no controls of their
 * own — editing one here means acting on the document at a distance, with no
 * surrounding text to judge it by, which is the opposite of what this view is
 * for. The way out sits at the top, in one fixed place, rather than appearing
 * under the pointer somewhere down the list.
 */

import { X } from "lucide-react";

import { cn } from "@/lib/utils";

import { HIGHLIGHT_STYLES } from "../constants";
import { useLiquidTextStore } from "../stores/liquid-text-store";
import { useLiquidTextUiStore } from "../stores/liquid-text-ui-store";
import type { Highlight } from "../types";

export function HighlightView() {
  const project = useLiquidTextStore((state) => state.project);
  const activeDocumentId = useLiquidTextStore((state) => state.activeDocumentId);
  const toggleHighlightView = useLiquidTextUiStore((state) => state.toggleHighlightView);

  const highlights = project.highlights
    .filter((highlight) => highlight.documentId === activeDocumentId)
    .sort((a, b) => a.pageNumber - b.pageNumber);

  const byPage = highlights.reduce<Record<number, Highlight[]>>((accumulator, highlight) => {
    const bucket = accumulator[highlight.pageNumber] ?? [];
    bucket.push(highlight);
    accumulator[highlight.pageNumber] = bucket;
    return accumulator;
  }, {});

  const pages = Object.keys(byPage)
    .map(Number)
    .sort((a, b) => a - b);

  const header = (
    <div className="flex shrink-0 items-center justify-between border-b border-border-subtle bg-surface-raised px-4 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        HighlightView
        {highlights.length > 0 &&
          ` · ${highlights.length} passage${highlights.length === 1 ? "" : "s"}`}
      </span>
      <button
        type="button"
        onClick={toggleHighlightView}
        aria-label="Close HighlightView"
        title="Close HighlightView — back to the document"
        className="flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-surface-sunken hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  if (highlights.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
          <p className="text-sm font-medium text-foreground">Nothing highlighted yet</p>
          <p className="max-w-sm text-xs text-text-muted">
            Select a passage in the document and pick a colour. HighlightView then collapses the
            document down to just those passages.
          </p>
          <button
            type="button"
            onClick={toggleHighlightView}
            className="mt-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Back to the document
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {pages.map((pageNumber) => (
          <div key={pageNumber} className="mb-3">
            {(byPage[pageNumber] ?? []).map((highlight) => {
              const style = HIGHLIGHT_STYLES[highlight.color];
              return (
                <div
                  key={highlight.id}
                  className="mb-1.5 flex items-stretch gap-3 rounded-lg bg-surface-raised px-3 py-2.5 shadow-elevation-raised"
                >
                  <span className="w-10 shrink-0 pt-0.5 text-[11px] font-medium text-text-muted">
                    P {pageNumber}
                  </span>
                  <span className={cn("w-1 shrink-0 rounded-full", style.bar)} />
                  <div className="min-w-0 flex-1">
                    <p
                      data-highlight-id={highlight.id}
                      className={cn(
                        "font-serif text-[13px] leading-[1.6] text-foreground",
                        style.mark,
                        "rounded px-0.5",
                      )}
                    >
                      {highlight.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
