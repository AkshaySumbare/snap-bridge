/**
 * Centre pane: the documents themselves, one scroll for however many are
 * selected in the rail — all of the first, then all of the second.
 *
 * The pane owns two things the rest of the feature depends on: text
 * selection capture, which drives the floating toolbar, and the
 * `data-highlight-id` / `data-paragraph-id` anchors the connector layer and
 * comment cards measure. The document is always the thing on screen — a
 * card's notches scroll it to the passage they point at rather than
 * replacing it with a collated view of that card's passages.
 */

import { Pencil, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/sonner";

import { cn } from "@/lib/utils";

import {
  HIGHLIGHT_STYLES,
  READER_PAGE_GUTTER,
  READER_PAGE_SCALE_MAX,
  READER_PAGE_SCALE_MIN,
  READER_PAGE_WIDTH,
} from "../constants";
import { usePageLoader } from "../api/use-page-loader";
import { useCaptureSelection } from "../hooks/use-reader-selection";
import { useLiquidTextStore } from "../stores/liquid-text-store";
import { useLiquidTextUiStore } from "../stores/liquid-text-ui-store";
import { PageSentinel } from "./page-sentinel";

/** Breathing room above a paragraph scrolled to, so it is not flush to the edge. */
const FOCUS_MARGIN = 24;
import { clamp } from "../utils/geometry";
import { DocumentSection } from "./document-section";
import { HighlightView } from "./highlight-view";

export function ReaderPane() {
  const project = useLiquidTextStore((state) => state.project);
  const activeDocumentId = useLiquidTextStore((state) => state.activeDocumentId);
  const selectedDocumentIds = useLiquidTextStore((state) => state.selectedDocumentIds);

  const highlightViewOpen = useLiquidTextUiStore((state) => state.highlightViewOpen);
  const searchQuery = useLiquidTextUiStore((state) => state.searchQuery);
  const panel = useLiquidTextUiStore((state) => state.panel);
  const setActiveHighlight = useLiquidTextUiStore((state) => state.setActiveHighlight);
  const focusedParagraphId = useLiquidTextUiStore((state) => state.focusedParagraphId);
  const focusParagraph = useLiquidTextUiStore((state) => state.focusParagraph);
  const setSelection = useLiquidTextUiStore((state) => state.setSelection);
  const selection = useLiquidTextUiStore((state) => state.selection);
  const reshapingHighlightId = useLiquidTextUiStore((state) => state.reshapingHighlightId);
  const setReshapingHighlight = useLiquidTextUiStore((state) => state.setReshapingHighlight);
  const reshapeHighlight = useLiquidTextStore((state) => state.reshapeHighlight);

  const captureSelection = useCaptureSelection();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pages = usePageLoader();
  const pageRef = useRef<HTMLDivElement | null>(null);

  const readerSearchQuery = panel === "search" ? searchQuery : "";

  /**
   * Every document on screen, in project order, each with the material the
   * reader needs for it — highlights resolve per document, not once for
   * "the" document.
   */
  const sections = useMemo(
    () =>
      selectedDocumentIds.flatMap((documentId) => {
        const document = project.documents.find((entry) => entry.id === documentId);
        if (!document) return [];
        return [
          {
            document,
            highlights: project.highlights.filter(
              (highlight) => highlight.documentId === documentId,
            ),
          },
        ];
      }),
    [selectedDocumentIds, project.documents, project.highlights],
  );

  /**
   * The one document allowed to ask for its opening pages right now.
   *
   * Ten documents ticked on used to mean ten `pages?from=1&to=25` requests
   * the moment the case opened — one screenful of reading, and nine bundles
   * of text fetched for a part of the scroll nobody had reached. So the
   * documents open in order: the earliest one still without pages is the only
   * candidate, and it still has to be near the viewport before anything is
   * asked for (`DocumentSection` owns that half).
   *
   * The two halves together are what makes this behave. In order alone would
   * open all ten in sequence without a scroll; near-the-viewport alone would
   * open all ten at once, because ten empty placeholders stack up inside one
   * screen. Together, the first document loads, its pages push the second far
   * below the fold, and the second waits there until it is scrolled to — or
   * until the rail's ticks make it the first one instead.
   */
  const nextToOpenId = useMemo(
    () =>
      sections.find(
        (section) =>
          section.document.pages.length === 0 && section.document.parse.status === "ready",
      )?.document.id ?? null,
    [sections],
  );

  /** Clicking an existing highlight opens the passage card over it. */
  const handleHighlightClick = useCallback(
    (highlightId: string) => setActiveHighlight(highlightId),
    [setActiveHighlight],
  );

  /**
   * Re-drawing a highlight: the next selection *is* the new extent.
   *
   * It has to land in the same paragraph — offsets are relative to that
   * paragraph's own text, so a selection elsewhere has no meaning for this
   * highlight, and silently moving it to another paragraph would be worse
   * than saying no.
   */
  useEffect(() => {
    if (!reshapingHighlightId || !selection) return;
    const target = project.highlights.find((entry) => entry.id === reshapingHighlightId);
    if (!target) {
      setReshapingHighlight(null);
      return;
    }
    if (selection.paragraphId !== target.paragraphId) {
      toast.error("Select inside the same paragraph as the highlight.");
      setSelection(null);
      return;
    }
    reshapeHighlight(reshapingHighlightId, selection.start, selection.end, selection.text);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    setReshapingHighlight(null);
    toast.success("Highlight updated");
  }, [
    reshapingHighlightId,
    selection,
    project.highlights,
    reshapeHighlight,
    setSelection,
    setReshapingHighlight,
  ]);

  // Escape abandons a re-draw started by mistake.
  useEffect(() => {
    if (!reshapingHighlightId) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setReshapingHighlight(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [reshapingHighlightId, setReshapingHighlight]);

  /**
   * Outline clicks, search hits and connector notches land here: bring the
   * paragraph into view and ring it briefly, so the eye can find it in a wall
   * of justified serif.
   *
   * Scrolled by hand rather than with `scrollIntoView`, which scrolls *every*
   * scrollable ancestor — the document included. The pages sit inside a
   * `transform: scale()` box whose visual edges can fall outside the frame, so
   * the browser would shunt the whole app sideways to satisfy it: the rail
   * clipped off the left, the canvas off the right, and empty gutters where
   * the page used to be. Moving one scroller's `scrollTop` cannot do that.
   */
  useEffect(() => {
    if (!focusedParagraphId) return undefined;

    const scroller = scrollRef.current;
    const node = scroller?.querySelector(`[data-paragraph-id="${focusedParagraphId}"]`);
    if (scroller && node) {
      // Measured against the scroller rather than the viewport, so the page's
      // scale and any ancestor offset are already accounted for.
      const offset =
        node.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop;
      const top = Math.max(0, offset - FOCUS_MARGIN);

      // `scrollTo` is missing in jsdom and a few older engines. Assigning
      // `scrollTop` lands in the same place without the easing, which beats
      // the effect throwing and taking the pane down with it.
      if (typeof scroller.scrollTo === "function") {
        scroller.scrollTo({ top, behavior: "smooth" });
      } else {
        scroller.scrollTop = top;
      }
    }

    const timer = window.setTimeout(() => focusParagraph(null), 2000);
    return () => window.clearTimeout(timer);
  }, [focusedParagraphId, focusParagraph]);

  /**
   * The page is laid out once at `READER_PAGE_WIDTH` and scaled to whatever
   * width the pane currently has. Dragging the divider therefore grows or
   * shrinks the page; it never re-breaks a line, so a passage stays the same
   * shape in the same place and the reader's eye keeps its bearings.
   */
  const [pageScale, setPageScale] = useState(1);
  /** Unscaled height of the page, so the scroller can size to the scaled one. */
  const [pageHeight, setPageHeight] = useState(0);

  /**
   * The measured nodes, held in state as well as in refs.
   *
   * The scroller is unmounted whenever HighlightView takes over the pane and
   * a fresh one is mounted on the way back. Keyed only on the sections, the
   * effect below never re-ran for that new node: its ResizeObserver stayed
   * bound to a detached element, no measurement ever happened again, and the
   * page kept whatever scale it had been left with — a column of text with
   * empty gutters either side of it.
   *
   * A ref changing re-runs nothing. State does, so the effect follows the
   * node rather than the data, and any future remount is handled the same.
   */
  const [measured, setMeasured] = useState<{
    scroller: HTMLDivElement | null;
    page: HTMLDivElement | null;
  }>({ scroller: null, page: null });

  const attachScroller = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    setMeasured((current) =>
      current.scroller === node ? current : { ...current, scroller: node },
    );
  }, []);

  const attachPage = useCallback((node: HTMLDivElement | null) => {
    pageRef.current = node;
    setMeasured((current) => (current.page === node ? current : { ...current, page: node }));
  }, []);

  useEffect(() => {
    const { scroller, page } = measured;
    if (!scroller || !page) return undefined;

    const measure = () => {
      const available = scroller.clientWidth - READER_PAGE_GUTTER;
      setPageScale(
        clamp(available / READER_PAGE_WIDTH, READER_PAGE_SCALE_MIN, READER_PAGE_SCALE_MAX),
      );
      // offsetHeight, not getBoundingClientRect: the latter reports the
      // *scaled* box, which would feed the scale back into itself.
      setPageHeight(page.offsetHeight);
    };

    measure();
    // Absent in jsdom; every browser we target has it. Without the observer
    // the page still measures once per render — only live drags are lost.
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    observer.observe(page);
    return () => observer.disconnect();
  }, [sections, measured]);

  /**
   * Put an open thread away once the reader has scrolled past the passage it
   * comes from.
   *
   * A connector runs from a passage on the page to a notch on a card. Scroll
   * the passage off the top and the line has nowhere sensible to start: it
   * stretches from somewhere off-screen across the whole pane, which reads as
   * a stray mark rather than a connection. The reader has moved on, so the
   * thread closes.
   */
  const openLinkKey = useLiquidTextUiStore((state) => state.openLinkKey);
  const hideAllConnectors = useLiquidTextUiStore((state) => state.hideAllConnectors);

  const openThreadParagraphId = useMemo(() => {
    if (!openLinkKey) return null;
    const [cardId, linkId] = openLinkKey.split(":");
    const card = project.workspaces
      .flatMap((workspace) => workspace.cards)
      .find((entry) => entry.id === cardId);
    return card?.connections.find((entry) => entry.linkId === linkId)?.paragraphId ?? null;
  }, [openLinkKey, project.workspaces]);

  useEffect(() => {
    const scroller = measured.scroller;
    if (!openThreadParagraphId || !scroller) return undefined;
    if (typeof IntersectionObserver === "undefined") return undefined;

    const node = scroller.querySelector(`[data-paragraph-id="${openThreadParagraphId}"]`);
    if (!node) return undefined;

    /*
      Only after it has been seen. Opening a notch scrolls the passage into
      view, and the observer reports the state before that scroll has landed —
      closing on that first answer would shut the thread the moment it opened.
    */
    let seen = false;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) seen = true;
          else if (seen) hideAllConnectors();
        }
      },
      { root: scroller },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [openThreadParagraphId, measured.scroller, hideAllConnectors]);

  /** Everything a paragraph needs that does not vary between documents. */
  const sharedParagraphProps = useMemo(
    () => ({
      searchQuery: readerSearchQuery,
      onHighlightClick: handleHighlightClick,
    }),
    [readerSearchQuery, handleHighlightClick],
  );

  if (sections.length === 0) {
    return (
      <section
        data-lt-reader=""
        className="flex min-w-0 flex-1 items-center justify-center bg-surface-base"
      >
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">No document open</p>
          <p className="mt-1 text-xs text-text-muted">
            Pick one from the rail, or add a document to this project.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      data-lt-reader=""
      className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-base"
    >
      {reshapingHighlightId !== null && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-brand-subtle px-3 py-1.5">
          <Pencil className="h-3.5 w-3.5 shrink-0 text-brand-subtle-foreground" />
          <p className="min-w-0 flex-1 text-[11px] text-brand-subtle-foreground">
            Select the text this highlight should cover.
          </p>
          <button
            type="button"
            onClick={() => setReshapingHighlight(null)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-brand-subtle-foreground hover:bg-surface-overlay"
          >
            <X className="h-3 w-3" />
            Cancel
          </button>
        </div>
      )}

      {highlightViewOpen ? (
        <HighlightView />
      ) : (
        <div className="relative flex min-h-0 flex-1">
          <div
            ref={attachScroller}
            onMouseUp={captureSelection}
            onTouchEnd={captureSelection}
            onMouseDown={(event) => {
              // A fresh press anywhere in the page dismisses the previous
              // selection toolbar / definition card before the new one lands.
              if (event.detail === 1) {
                setSelection(null);
                setActiveHighlight(null);
              }
            }}
            className="min-h-0 flex-1 touch-pan-y overflow-auto py-5"
          >
            {/*
              The frame carries the page's *scaled* size, because a CSS
              transform does not affect layout — without it the scroller would
              size to the unscaled page and scroll to the wrong depth.
            */}
            <div
              className="relative mx-auto"
              style={{
                width: READER_PAGE_WIDTH * pageScale,
                height: pageHeight * pageScale,
              }}
            >
              <div
                ref={attachPage}
                style={{
                  width: READER_PAGE_WIDTH,
                  transform: `scale(${pageScale})`,
                  transformOrigin: "top left",
                }}
              >
                {sections.map((section) => (
                  <Fragment key={section.document.id}>
                    <DocumentSection
                      document={section.document}
                      highlights={section.highlights}
                      focusedParagraphId={focusedParagraphId}
                      showTitle={sections.length > 1}
                      isActive={section.document.id === activeDocumentId}
                      nextToOpen={section.document.id === nextToOpenId}
                      onOpenPages={pages.loadFirst}
                      shared={sharedParagraphProps}
                    />
                    {/*
                    Only where there is more of this document to come. A long
                    PDF arrives 25 pages at a time, and without this the
                    reader stopped at the first window with the rest sitting
                    on the server, unasked for.
                  */}
                    {section.document.pages.length > 0 &&
                      section.document.pages.length < section.document.parse.pageCount && (
                        <PageSentinel
                          documentId={section.document.id}
                          loaded={section.document.pages.length}
                          total={section.document.parse.pageCount}
                          onReach={pages.loadMore}
                        />
                      )}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>

          {/* Highlight mini-map — one tick per highlight, in page order. */}
          <div className="flex w-3 shrink-0 flex-col gap-px border-l border-border-subtle bg-surface-sunken py-2">
            {sections.flatMap((section) =>
              section.highlights.map((highlight) => (
                <button
                  key={highlight.id}
                  type="button"
                  title={`${section.document.title} · p.${highlight.pageNumber} — ${highlight.text.slice(0, 60)}…`}
                  onClick={() => {
                    // The mini-map lists every highlight in the case, not just
                    // the ones on loaded pages — so a tick can point at a page
                    // the reader has never scrolled to.
                    if (pages.hasPage(highlight.documentId, highlight.pageNumber)) {
                      focusParagraph(highlight.paragraphId);
                      return;
                    }
                    void pages
                      .ensurePage(highlight.documentId, highlight.pageNumber)
                      .then(() => focusParagraph(highlight.paragraphId));
                  }}
                  className={cn("h-1.5 w-full", HIGHLIGHT_STYLES[highlight.color].bar)}
                  style={{
                    marginTop: `${(highlight.pageNumber / Math.max(1, section.document.pages.length)) * 6}px`,
                  }}
                />
              )),
            )}
          </div>
        </div>
      )}
    </section>
  );
}
