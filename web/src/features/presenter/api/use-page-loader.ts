/**
 * Pulls a long document down, a window at a time.
 *
 * Bootstrap carries no paragraphs and the first fetch takes only the opening
 * window, because a 644-page bundle runs to megabytes and the reader can see
 * about one page of it. Everything after that is fetched as they scroll into
 * it — which is the part that was missing: the reader loaded pages 1–25 and
 * then simply stopped, with 619 pages sitting on the server and no request
 * that would ever ask for them.
 */

import { useCallback, useMemo, useRef } from "react";

import { useLiquidTextStore } from "../stores/liquid-text-store";
import { mapPages } from "./mappers";
import { PAGE_WINDOW } from "./page-window";
import { fetchPages } from "./presenter-api";

export interface PageLoader {
  /** Pull the next window, as the reader scrolls toward the end of what is loaded. */
  loadMore: (documentId: string) => Promise<void>;
  /**
   * Make sure a particular page is loaded, whatever it takes.
   *
   * Jumping to a passage is not scrolling: a connector on page 240 has to
   * work from page 1 without twenty round trips first, so this fetches
   * everything up to it in one request.
   */
  ensurePage: (documentId: string, pageNumber: number) => Promise<void>;
  /** Is that page already here? Lets a caller stay synchronous when it is. */
  hasPage: (documentId: string, pageNumber: number) => boolean;
  /**
   * Pull a document's *first* window, when it comes into view.
   *
   * The same request as `loadMore` from a standing start, named separately
   * because the caller is different in kind: this is a document being opened
   * for the first time, not a scroll running off the end of one already open.
   */
  loadFirst: (documentId: string) => Promise<void>;
}

export function usePageLoader(): PageLoader {
  const presenterId = useLiquidTextStore((state) => state.project.id);
  const appendDocumentPages = useLiquidTextStore((state) => state.appendDocumentPages);

  /**
   * Windows currently in the air, so scrolling past the sentinel a dozen
   * times in one flick asks for the next window once.
   */
  const inFlight = useRef(new Set<string>());

  /**
   * Fetch one contiguous range and fold it in.
   *
   * Read through `getState` rather than a subscription: callers run from
   * observer callbacks and click handlers, where a value captured at render
   * time would be whatever was true several windows ago.
   */
  const fetchRange = useCallback(
    async (documentId: string, wanted: number | null) => {
      const document = useLiquidTextStore
        .getState()
        .project.documents.find((entry) => entry.id === documentId);

      if (!document || document.parse.status !== "ready") return;

      /*
       * The highest page held, not how many are held.
       *
       * They are the same while pages arrive in order from 1, which is the
       * only way they arrive today — but a count silently becomes the wrong
       * answer the moment anything loads a range out of order, and that is a
       * bug nobody would find by reading this function.
       */
      const highest = document.pages.reduce((top, page) => Math.max(top, page.number), 0);
      /*
       * Zero is a real starting point, not a reason to stop.
       *
       * It used to bail here, which meant the *opening* window had to come
       * from somewhere else — and that somewhere else was hydration, which
       * fetched every selected document at once: ten documents open meant ten
       * simultaneous `pages?from=1&to=25` requests for text the reader could
       * not see nine tenths of. Letting the loader start from nothing gives
       * the fetching one owner, and that owner is driven by what is on screen.
       */
      if (document.parse.pageCount <= 0 || highest >= document.parse.pageCount) return;
      if (wanted !== null && wanted <= highest) return;

      const from = highest + 1;
      // A jump asks for everything up to its target; a scroll asks for one
      // window. Either way at least a window, so landing on a passage does
      // not leave the reader one page from the end of what is loaded.
      const to = Math.min(document.parse.pageCount, Math.max(wanted ?? 0, highest + PAGE_WINDOW));

      const key = `${documentId}:${from}:${to}`;
      if (inFlight.current.has(key)) return;
      inFlight.current.add(key);

      try {
        const result = await fetchPages(presenterId, documentId, from, to);
        appendDocumentPages(documentId, mapPages(result.pages));
      } catch {
        // Left for the next scroll or click to ask again. A window that
        // failed once is not a document the reader should be locked out of.
      } finally {
        inFlight.current.delete(key);
      }
    },
    [presenterId, appendDocumentPages],
  );

  const loadMore = useCallback((documentId: string) => fetchRange(documentId, null), [fetchRange]);

  const ensurePage = useCallback(
    (documentId: string, pageNumber: number) => fetchRange(documentId, pageNumber),
    [fetchRange],
  );

  const hasPage = useCallback(
    (documentId: string, pageNumber: number) =>
      useLiquidTextStore
        .getState()
        .project.documents.find((entry) => entry.id === documentId)
        ?.pages.some((page) => page.number === pageNumber) ?? false,
    [],
  );

  return useMemo(
    () => ({ loadMore, ensurePage, hasPage, loadFirst: loadMore }),
    [loadMore, ensurePage, hasPage],
  );
}
