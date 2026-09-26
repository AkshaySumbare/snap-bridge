/**
 * Project search: plain substring matching over everything the case holds —
 * every document's text and every card on the workspace.
 *
 * Hits are navigated with Prev/Next, which drives the reader's focused
 * paragraph (or spotlights a card), so the result list and the panes stay in
 * step.
 */

import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useEffect, useMemo } from "react";

import { cn } from "@/lib/utils";

import { useNarrowLayout } from "../hooks/use-narrow-layout";
import { useLiquidTextStore } from "../stores/liquid-text-store";
import { useLiquidTextUiStore } from "../stores/liquid-text-ui-store";
import type { SearchHit } from "../types";
import { searchProject } from "../utils/search";

export function SearchPanel() {
  const project = useLiquidTextStore((state) => state.project);
  const setActiveDocument = useLiquidTextStore((state) => state.setActiveDocument);

  const query = useLiquidTextUiStore((state) => state.searchQuery);
  const setQuery = useLiquidTextUiStore((state) => state.setSearchQuery);
  const hitIndex = useLiquidTextUiStore((state) => state.searchHitIndex);
  const setHitIndex = useLiquidTextUiStore((state) => state.setSearchHitIndex);
  const closePanel = useLiquidTextUiStore((state) => state.closePanel);
  const focusParagraph = useLiquidTextUiStore((state) => state.focusParagraph);
  const spotlightCard = useLiquidTextUiStore((state) => state.spotlightCard);
  const canvasWidth = useLiquidTextUiStore((state) => state.canvasWidth);
  const railCollapsed = useLiquidTextUiStore((state) => state.railCollapsed);
  const isNarrow = useNarrowLayout();

  const hits = useMemo(() => searchProject({ project, query }), [project, query]);

  function openHit(hit: SearchHit) {
    if (hit.kind === "paragraph" && hit.documentId && hit.paragraphId) {
      setActiveDocument(hit.documentId);
      focusParagraph(hit.paragraphId);
      spotlightCard(null);
      return;
    }
    if (hit.cardId) spotlightCard(hit.cardId);
  }

  // Keep the panes following the Prev/Next cursor.
  useEffect(() => {
    const hit = hits[hitIndex];
    if (hit) openHit(hit);
    // openHit is stable enough for this effect's purpose; re-running on every
    // store setter identity change would fight the user's own navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hitIndex, hits]);

  return (
    <aside
      data-lt-search=""
      style={
        canvasWidth === null || isNarrow ? undefined : { width: canvasWidth, maxWidth: "none" }
      }
      className={cn(
        "relative flex h-full min-h-0 w-full shrink-0 flex-col border-l border-border-subtle bg-surface-raised lg:min-w-[320px]",
        canvasWidth === null &&
          (railCollapsed ? "lg:w-[57.1428%]" : "lg:w-[36%] lg:max-w-[520px]"),
      )}
    >
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search this project"
            autoFocus
            className="w-full rounded-full bg-input-background py-2 pl-8 pr-8 text-sm text-foreground outline-none placeholder:text-input-placeholder focus:ring-1 focus:ring-ring"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-surface-sunken text-text-muted hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={closePanel}
          aria-label="Close search"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-sunken hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2.5 border-b border-border-subtle px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">
            {hits.length} result{hits.length === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={hits.length === 0}
              onClick={() => setHitIndex((hitIndex - 1 + hits.length) % Math.max(1, hits.length))}
              className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-text-secondary hover:bg-surface-sunken disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <button
              type="button"
              disabled={hits.length === 0}
              onClick={() => setHitIndex((hitIndex + 1) % Math.max(1, hits.length))}
              className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-text-secondary hover:bg-surface-sunken disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2">
        {query.trim().length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
            <p className="text-sm font-medium text-foreground">Search this presenter</p>
            <p className="mt-2 max-w-xs text-xs leading-relaxed text-text-muted">
              Find text in your open documents or on workspace cards. Use Prev and Next to jump to
              each match.
            </p>
          </div>
        )}
        {query.trim().length > 0 && hits.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
            <p className="text-sm font-medium text-foreground">No matches</p>
            <p className="mt-2 max-w-xs text-xs text-text-muted">
              Nothing in this presenter matched your search. Try different words or check spelling.
            </p>
          </div>
        )}
        {hits.map((hit, index) => (
          <button
            key={hit.id}
            type="button"
            onClick={() => {
              setHitIndex(index);
              openHit(hit);
            }}
            className={cn(
              "mb-1 block w-full rounded-lg px-3 py-2 text-left transition-colors",
              index === hitIndex
                ? "bg-primary/10 ring-1 ring-primary/40"
                : "hover:bg-surface-sunken",
            )}
          >
            <p className="mb-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-text-muted">
              <span className="truncate">{hit.documentTitle}</span>
              {hit.pageNumber !== null && <span>· p.{hit.pageNumber}</span>}
            </p>
            <p className="font-serif text-[12px] leading-snug text-foreground">
              {hit.snippet.slice(0, hit.matchStart)}
              <mark className="rounded-sm bg-status-warning/50 text-foreground">
                {hit.snippet.slice(hit.matchStart, hit.matchEnd)}
              </mark>
              {hit.snippet.slice(hit.matchEnd)}
            </p>
          </button>
        ))}
      </div>
    </aside>
  );
}
