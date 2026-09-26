/**
 * One document inside the reader's scroll.
 *
 * Several documents share a single scroller — all of the first, then all of
 * the second — so each renders its own pages under its own heading.
 *
 * A page is the original PDF wherever it can be: the file as it looks, with
 * its own fonts, headings and bullets. Where it cannot be — the file will not
 * load, or the parser could not place the lines — the extracted text is
 * typeset instead. Both are annotated the same way, so which one the reader
 * gets changes how the page looks and nothing else.
 */

import { FileText, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { useNearViewport } from "../hooks/use-near-viewport";
import { usePdfDocument } from "../hooks/use-pdf-document";
import { useLiquidTextStore } from "../stores/liquid-text-store";
import type { Highlight, LiquidDocument } from "../types";
import { DocumentParagraphView } from "./document-paragraph";
import { PdfPage } from "./pdf-page";

interface DocumentSectionProps {
  document: LiquidDocument;
  highlights: readonly Highlight[];
  focusedParagraphId: string | null;
  /** Only shown when more than one document is on screen. */
  showTitle: boolean;
  /** Marks the document the reader is pointed at, when several are shown. */
  isActive: boolean;
  /**
   * This is the earliest document on screen still without pages, so it is the
   * one whose opening window may be requested. The reader pane decides;
   * see the note on `nextToOpenId` there for why the order matters.
   */
  nextToOpen: boolean;
  /** Asks for that opening window. Only ever called for `nextToOpen`. */
  onOpenPages: (documentId: string) => void;
  shared: {
    searchQuery: string;
    onHighlightClick: (highlightId: string) => void;
  };
}

export function DocumentSection({
  document,
  highlights,
  focusedParagraphId,
  showTitle,
  isActive,
  nextToOpen,
  onOpenPages,
  shared,
}: DocumentSectionProps) {
  const paragraphProps = {
    highlights,
    ...shared,
  };

  const presenterId = useLiquidTextStore((state) => state.project.id);
  /*
   * The file itself is opened only once there is something to lay over it.
   *
   * pdf.js opens with auto-fetch off, so a session is cheap — but it is not
   * free, and a case of ten documents opened ten of them before a single page
   * of nine of them had been asked for. Passing `null` until the pages are
   * here keeps the file and its text on the same schedule.
   */
  const { pdf } = usePdfDocument(presenterId, document.pages.length > 0 ? document.id : null);

  /*
   * The file's own page count, not the count of pages fetched so far.
   *
   * `pages` fills in a request after the case opens, so measuring the heading
   * by it labelled every document "0 pages" for as long as that took — the one
   * number on screen, and wrong, on a document the server had already finished
   * reading. `parse.pageCount` is known the moment the server opens the file.
   * Zero only while it has not, and then no honest number exists to print.
   */
  const pageTotal = document.parse.pageCount || document.pages.length;

  /** A parse that stopped. The rail owns the retry; this only stops pretending. */
  const unreadable = document.parse.status === "failed" || document.parse.status === "stalled";

  /*
   * Ask for the opening window when this document is genuinely about to be
   * read — its turn has come *and* it is within reach of the viewport.
   *
   * Measured on the placeholder below, which stands exactly where the pages
   * will be. Once they arrive it is replaced by them, the observer goes with
   * it, and the sentinel at the end of the document takes over for every
   * window after this one.
   */
  const [placeholder, setPlaceholder] = useState<HTMLDivElement | null>(null);
  const placeholderNear = useNearViewport(placeholder);
  const awaitingPages = document.pages.length === 0 && document.parse.status === "ready";

  useEffect(() => {
    if (!awaitingPages || !nextToOpen || !placeholderNear) return;
    onOpenPages(document.id);
  }, [awaitingPages, nextToOpen, placeholderNear, onOpenPages, document.id]);

  /**
   * Read, but not asked for: the documents above it open first.
   *
   * Deliberately not `!(nextToOpen && placeholderNear)`. Being next in line
   * but off screen is also "not asked for", but the only reader who could see
   * this box is one looking at it — which is what makes it near — so that
   * state is never actually on anyone's screen, and folding it in here would
   * flash "Ready to open" on the first document for the frame before the
   * observer's first answer arrives.
   */
  const queued = awaitingPages && !nextToOpen;

  return (
    <section data-document-section={document.id} className="mb-6 last:mb-0">
      {showTitle && (
        /*
         * Scrolls away with the document, deliberately not pinned.
         *
         * It names the document the pages beneath it belong to, which is worth
         * seeing when you arrive at one and worth nothing for the rest of the
         * scroll — and pinned it costs a strip of every page behind it, on the
         * one pane where vertical space is the whole point. The rail already
         * marks which document is active, so nothing is lost by letting it go.
         */
        <header
          className={cn(
            "mx-auto mb-3 flex max-w-[900px] items-center gap-2 rounded-md border-b px-2 py-1.5",
            isActive ? "border-primary/50" : "border-border-subtle",
          )}
        >
          <FileText
            className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-primary" : "text-text-muted")}
          />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
            {document.title}
          </span>
          {pageTotal > 0 && (
            <span className="shrink-0 text-[10px] text-text-muted">
              {pageTotal} page{pageTotal === 1 ? "" : "s"}
            </span>
          )}
        </header>
      )}

      {/*
        Nothing to render yet, so say which of the three reasons it is.
        Saying so beats an empty stretch of pane: an upload that has plainly
        succeeded and then shows nothing reads as a failure.

        Three reasons, and they used to be one. The server can still be
        reading the file — `pending`/`running`, with a page count to show
        progress against. Or it has finished and this document's text is being
        fetched, which is its own trip and lands well after the parse does.
        Or it has finished and nothing has been asked for yet, because the
        documents above this one open first and the reader has not come down
        this far — a spinner there would promise a request that is not on its
        way.
      */}
      {document.pages.length === 0 && !unreadable && (
        <div
          ref={setPlaceholder}
          className="mx-auto mb-4 flex max-w-[900px] flex-col items-center justify-center gap-3 rounded-lg bg-surface-overlay px-5 py-10 text-center shadow-elevation-raised sm:px-10 sm:py-16"
        >
          {/*
            The spinner means "a request is running", and only ever that.
            Queued behind the documents above it, this shows the file's mark
            instead: still, because nothing is happening yet.
          */}
          {queued ? (
            <FileText className="h-5 w-5 text-text-muted" aria-hidden />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-text-muted" aria-hidden />
          )}
          <p className="text-sm font-medium text-foreground">
            {document.parse.status !== "ready" ? "Reading" : queued ? "Ready to open" : "Opening"} “
            {document.title}”
          </p>
          <p className="max-w-sm text-xs text-text-muted">
            {document.parse.status !== "ready"
              ? document.parse.pageCount > 0
                ? `Page ${document.parse.pagesDone} of ${document.parse.pageCount}. It opens here as soon as it is ready.`
                : "This takes a moment for a long document. It opens here as soon as it is ready."
              : queued
                ? `${pageTotal} page${pageTotal === 1 ? "" : "s"}, loaded when you scroll here.`
                : "Its pages are on their way."}
          </p>
          {/*
            Only while there is something to be part-way through. A fetch that
            has already been asked for has no fraction to report, and a bar
            stuck at one value says less than no bar at all.
          */}
          {document.parse.status !== "ready" && document.parse.pageCount > 0 && (
            <span className="h-1 w-56 overflow-hidden rounded-full bg-surface-sunken">
              <span
                className="block h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                style={{
                  width: `${Math.min(100, Math.round((document.parse.pagesDone / document.parse.pageCount) * 100))}%`,
                }}
              />
            </span>
          )}
        </div>
      )}

      {/*
        A parse that stopped, which a spinner would misreport as still going.
        The way back is the retry in the rail, beside the document it belongs
        to — repeating it here would put two controls on one action.
      */}
      {document.pages.length === 0 && unreadable && (
        <div className="mx-auto mb-4 max-w-[900px] rounded-lg bg-surface-overlay px-5 py-8 text-center shadow-elevation-raised">
          <p className="text-sm font-medium text-foreground">
            “{document.title}” could not be read
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Use the retry beside it in the document list to try again.
          </p>
        </div>
      )}

      {document.pages.map((page) =>
        // Laid over the real page wherever there is one and the parser placed
        // its lines; typeset from the extracted text otherwise.
        pdf && page.paragraphs.some((paragraph) => paragraph.runs?.length) ? (
          <PdfPage
            key={page.number}
            pdf={pdf}
            page={page}
            documentId={document.id}
            highlights={highlights}
            focusedParagraphId={focusedParagraphId}
            onHighlightClick={shared.onHighlightClick}
          />
        ) : (
          <article
            key={page.number}
            className="mx-auto mb-4 max-w-[900px] rounded-lg bg-surface-overlay px-4 py-6 shadow-elevation-raised sm:px-10 sm:py-8"
          >
            <p className="mb-4 text-[11px] font-medium text-text-muted">P {page.number}</p>
            <div className="space-y-3">
              {page.paragraphs.map((paragraph) => (
                <DocumentParagraphView
                  key={paragraph.id}
                  paragraph={paragraph}
                  documentId={document.id}
                  pageNumber={page.number}
                  focused={focusedParagraphId === paragraph.id}
                  {...paragraphProps}
                />
              ))}
            </div>
          </article>
        ),
      )}
    </section>
  );
}
