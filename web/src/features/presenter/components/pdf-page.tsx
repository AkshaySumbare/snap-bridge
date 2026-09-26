/**
 * One page of the original PDF, with the reader's annotations over it.
 *
 * Three layers, all the same size and exactly aligned:
 *
 *   1. a canvas, painted by pdf.js — the file as it actually looks, with its
 *      own fonts, headings, bullets, tables and images;
 *   2. highlight rectangles, drawn from the stored line boxes;
 *   3. an invisible text layer, positioned from the same boxes.
 *
 * Only pages near the viewport keep a painted canvas. The rest hold their
 * exact space as an empty box and are repainted when the reader comes back —
 * a bitmap costs the same whether or not anyone is looking at it, so a long
 * document read end to end would otherwise accumulate every page it passed.
 * The text layer stays mounted throughout, so a highlight or a connector
 * anchored to a page well off screen still resolves.
 *
 * The third layer is what keeps everything else working. Selection, highlighting,
 * connector anchors and the passage toolbar all resolve by walking up to a
 * `data-paragraph-id` element and counting characters inside it, so the
 * overlay carries the real text in real paragraph containers. Nothing that
 * consumes those had to change: a Highlight is still `{paragraphId, start,
 * end}`, and every one made before this still resolves.
 */

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { HIGHLIGHT_STYLES } from "../constants";
import { useNearViewport } from "../hooks/use-near-viewport";
import { PARAGRAPH_ATTR } from "../hooks/use-reader-selection";
import type { PdfDocument } from "../hooks/use-pdf-document";
import type { DocumentPage, Highlight, TextRun } from "../types";

/**
 * Render resolution. The canvas is painted at twice its layout size so text
 * stays crisp on the retina displays this is read on, and on the zoom the
 * reader applies by dragging the divider.
 */
const RENDER_SCALE = 2;

/**
 * Shape assumed until the real one is known.
 *
 * US Letter, which is what the parser reports for these documents. Without a
 * placeholder ratio an unmeasured page has no height, so every page in the
 * scroll stacks at zero and all of them count as near the viewport at once —
 * which would paint the whole document on open, the exact thing this avoids.
 */
const ASSUMED_ASPECT = 612 / 792;

interface PdfPageProps {
  pdf: PdfDocument;
  page: DocumentPage;
  documentId: string;
  highlights: readonly Highlight[];
  focusedParagraphId: string | null;
  onHighlightClick: (highlightId: string) => void;
}

/**
 * The box a whole paragraph occupies, as the union of its lines.
 *
 * The paragraph element has to be a real box, not a wrapper: `startConnect`
 * and `usePassageAnchors` both measure it and store positions as fractions of
 * it. Left to size itself around absolutely-positioned children it collapsed
 * to zero height, and every connector anchor with it — all of them landing in
 * a row along the top of the page.
 */
function paragraphBox(runs: readonly TextRun[]) {
  const x0 = Math.min(...runs.map((run) => run.bbox[0]));
  const y0 = Math.min(...runs.map((run) => run.bbox[1]));
  const x1 = Math.max(...runs.map((run) => run.bbox[2]));
  const y1 = Math.max(...runs.map((run) => run.bbox[3]));
  // Never zero: a ratio of it is about to be divided by.
  return { x0, y0, width: Math.max(x1 - x0, 1e-6), height: Math.max(y1 - y0, 1e-6) };
}

/** A run's box, in percentages of the paragraph box it sits in. */
function within(run: TextRun, box: ReturnType<typeof paragraphBox>) {
  const [x0, y0, x1, y1] = run.bbox;
  return {
    left: ((x0 - box.x0) / box.width) * 100,
    top: ((y0 - box.y0) / box.height) * 100,
    width: ((x1 - x0) / box.width) * 100,
    height: ((y1 - y0) / box.height) * 100,
  };
}

/** The slice of a run covered by `[start, end)`, as a fraction of that run. */
function overlap(run: TextRun, start: number, end: number) {
  const from = Math.max(run.start, start);
  const to = Math.min(run.end, end);
  if (to <= from) return null;

  const span = Math.max(1, run.end - run.start);
  return { from: (from - run.start) / span, to: (to - run.start) / span };
}

export function PdfPage({
  pdf,
  page,
  documentId,
  highlights,
  focusedParagraphId,
  onHighlightClick,
}: PdfPageProps) {
  const frameRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const near = useNearViewport(frameRef);

  /**
   * The page's dimensions, without painting it.
   *
   * Separate from the render on purpose: the frame needs its aspect ratio
   * from the first moment, including for pages that will never be painted
   * because the reader never scrolls near them. Taken from the render, an
   * unpainted page would have no height, every page would stack at zero, and
   * the whole document would sit inside the viewport at once — which is the
   * opposite of what this is for.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const rendered = await pdf.getPage(page.number);
      if (cancelled) return;
      const viewport = rendered.getViewport({ scale: 1 });
      setSize({ width: viewport.width, height: viewport.height });
    })();

    return () => {
      cancelled = true;
    };
  }, [pdf, page.number]);

  useEffect(() => {
    // Captured now rather than read in the cleanup: the element the effect
    // painted is the one whose memory it has to give back.
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    if (!near) {
      // A canvas defaults to 300x150 and allocates for it. Small, but paid on
      // every page of a long document for a bitmap nobody will ever see.
      canvas.width = 0;
      canvas.height = 0;
      return undefined;
    }

    let cancelled = false;
    let task: { cancel: () => void } | null = null;

    void (async () => {
      const rendered = await pdf.getPage(page.number);
      if (cancelled) return;

      const viewport = rendered.getViewport({ scale: RENDER_SCALE });
      const context = canvas.getContext("2d");
      if (!context) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const render = rendered.render({ canvasContext: context, viewport });
      task = render;
      try {
        await render.promise;
      } catch {
        // A render cancelled by a scroll or an unmount, which is routine.
      }
      rendered.cleanup();
    })();

    return () => {
      cancelled = true;
      task?.cancel();

      /*
        Sized to nothing, not merely hidden. The backing store is freed by
        giving the canvas no area — leaving the element at its old dimensions
        would keep every byte of it while showing the reader an empty box, so
        the memory would never actually come back.
      */
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [pdf, page.number, near]);

  return (
    <article
      ref={frameRef}
      data-page-number={page.number}
      className="relative mx-auto mb-4 w-full max-w-[900px] overflow-hidden rounded-lg bg-surface-overlay shadow-elevation-raised"
      style={{ aspectRatio: size ? `${size.width} / ${size.height}` : String(ASSUMED_ASPECT) }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />

      {/*
        Everything below sits on top of the canvas in percentage coordinates,
        so it tracks the page at any width without re-measuring.
      */}
      <div className="absolute inset-0 [container-type:size]">
        {page.paragraphs.map((paragraph) => {
          const runs = paragraph.runs;
          if (!runs?.length) return null;

          const mine = highlights.filter((entry) => entry.paragraphId === paragraph.id);
          const box = paragraphBox(runs);

          return (
            /*
              All three attributes, because `readSelection` reads all three off
              this element and refuses a selection missing any of them. The
              paragraph's own text content is the concatenation of the run
              slices below and nothing else — the highlight rectangles carry no
              text — so the character offsets counted here are the same ones
              every stored Highlight is expressed in.
            */
            <div
              key={paragraph.id}
              {...{ [PARAGRAPH_ATTR]: paragraph.id }}
              data-document-id={documentId}
              data-page-number={page.number}
              className="absolute"
              style={{
                left: `${box.x0 * 100}%`,
                top: `${box.y0 * 100}%`,
                width: `${box.width * 100}%`,
                height: `${box.height * 100}%`,
              }}
            >
              {mine.map((highlight) =>
                runs.map((run) => {
                  const slice = overlap(run, highlight.start, highlight.end);
                  if (!slice) return null;

                  const line = within(run, box);
                  return (
                    <span
                      key={`${highlight.id}-${run.start}`}
                      aria-hidden
                      className={cn(
                        // Decoration only. The click lives on the text above
                        // it, which is what the pointer actually reaches.
                        "pointer-events-none absolute rounded-sm mix-blend-multiply",
                        HIGHLIGHT_STYLES[highlight.color].mark,
                      )}
                      style={{
                        left: `${line.left + line.width * slice.from}%`,
                        top: `${line.top}%`,
                        width: `${line.width * (slice.to - slice.from)}%`,
                        height: `${line.height}%`,
                      }}
                    />
                  );
                }),
              )}

              {/*
                The text itself, invisible but real and selectable. Each run is
                sliced up to where the *next* one begins, so the space that
                joins two lines is carried along and the character offsets in
                here match the ones stored against every highlight.
              */}
              {runs.map((run, index) => {
                const next = runs[index + 1];
                const line = within(run, box);
                const [, y0, , y1] = run.bbox;

                /*
                  The highlight this run falls inside, if any.
                  
                  It has to live on the text rather than on the coloured
                  rectangle. The text layer is painted last so it can be
                  selected, which also means it is what a click lands on —
                  a handler on the rectangle underneath never fires, and
                  Edit and Remove become unreachable. The original renderer
                  had no such split: the highlight *was* the span.
                */
                const covering = mine.find((entry) => overlap(run, entry.start, entry.end));

                return (
                  <span
                    key={run.start}
                    {...(covering ? { "data-highlight-id": covering.id } : {})}
                    onClick={
                      covering
                        ? (event) => {
                            // A drag that ends here is a selection, not a
                            // request to open what was underneath it.
                            if (window.getSelection()?.isCollapsed === false) return;
                            event.stopPropagation();
                            onHighlightClick(covering.id);
                          }
                        : undefined
                    }
                    className={cn(
                      "absolute select-text whitespace-pre text-transparent",
                      covering && "cursor-pointer",
                      focusedParagraphId === paragraph.id && "bg-primary/10",
                    )}
                    style={{
                      left: `${line.left}%`,
                      top: `${line.top}%`,
                      width: `${line.width}%`,
                      height: `${line.height}%`,
                      // Sized against the page rather than the paragraph, so a
                      // selection drag tracks the glyphs underneath instead of
                      // a band scaled to however tall the paragraph happens to
                      // be.
                      fontSize: `${(y1 - y0) * 100}cqh`,
                      lineHeight: 1,
                    }}
                  >
                    {paragraph.text.slice(run.start, next ? next.start : run.end)}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </article>
  );
}
