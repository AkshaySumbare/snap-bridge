/**
 * Places comment cards on the seam between the reader and the workspace.
 *
 * A comment belongs to a passage, so its vertical position is whatever the
 * DOM says its highlight is at right now — that way it tracks scrolling,
 * collapsing and document switches without anything having to tell it to.
 * Horizontally it is centred on the reader pane's right edge, which is what
 * makes it read as half in the document and half on the canvas.
 *
 * Cards are measured against the shared overlay (the same coordinate space
 * the connector layer uses), because that is the only element spanning both
 * panes. A card whose passage has scrolled out of the reader's viewport is
 * reported `visible: false` rather than being clamped to the edge — a comment
 * pinned next to the wrong paragraph would be worse than one that is absent.
 */

import { useCallback, useEffect, useState } from "react";

import { MARGIN_CARD_GAP, MARGIN_CARD_WIDTH } from "../constants";

interface MarginAnchor {
  cardId: string;
  /** Highlight the comment hangs off; empty when it has none. */
  highlightId: string;
}

export interface MarginPlacement {
  cardId: string;
  top: number;
  left: number;
  visible: boolean;
}

/** Height assumed before a card has rendered once, to seed the collision sweep. */
const ASSUMED_CARD_HEIGHT = 62;
export function useMarginPlacements(
  overlayRef: React.RefObject<HTMLElement>,
  anchors: readonly MarginAnchor[],
  revision: unknown,
): MarginPlacement[] {
  const [placements, setPlacements] = useState<MarginPlacement[]>([]);

  const measure = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) {
      setPlacements((previous) => (previous.length === 0 ? previous : []));
      return;
    }

    const reader = overlay.querySelector<HTMLElement>("[data-lt-reader]");
    if (!reader || anchors.length === 0) {
      setPlacements((previous) => (previous.length === 0 ? previous : []));
      return;
    }

    const origin = overlay.getBoundingClientRect();
    const readerRect = reader.getBoundingClientRect();
    const left = readerRect.right - origin.left - MARGIN_CARD_WIDTH / 2;
    // The scrolling body starts below the collapse strip; anything above that
    // is under the chrome rather than beside a passage.
    const viewportTop = readerRect.top + 48;
    const viewportBottom = readerRect.bottom;

    const measured = anchors.map((anchor) => {
      const node = anchor.highlightId
        ? reader.querySelector<HTMLElement>(`[data-highlight-id="${anchor.highlightId}"]`)
        : null;
      const rect = node?.getBoundingClientRect();
      const card = overlay.ownerDocument.querySelector<HTMLElement>(
        `[data-margin-card-id="${anchor.cardId}"]`,
      );
      return {
        cardId: anchor.cardId,
        anchorTop: rect ? rect.top : Number.NaN,
        height: card?.offsetHeight ?? ASSUMED_CARD_HEIGHT,
        visible: Boolean(rect) && rect!.bottom > viewportTop && rect!.top < viewportBottom,
      };
    });

    const ordered = measured
      .filter((entry) => entry.visible)
      .sort((a, b) => a.anchorTop - b.anchorTop);

    const next: MarginPlacement[] = measured
      .filter((entry) => !entry.visible)
      .map((entry) => ({ cardId: entry.cardId, top: 0, left, visible: false }));

    let floor = viewportTop;
    for (const entry of ordered) {
      const top = Math.max(entry.anchorTop - 6, floor);
      next.push({ cardId: entry.cardId, top: top - origin.top, left, visible: true });
      floor = top + entry.height + MARGIN_CARD_GAP;
    }

    setPlacements((previous) => {
      if (
        previous.length === next.length &&
        next.every((entry, index) => {
          const before = previous[index];
          return (
            before?.cardId === entry.cardId &&
            before.top === entry.top &&
            before.left === entry.left &&
            before.visible === entry.visible
          );
        })
      ) {
        return previous;
      }
      return next;
    });
  }, [anchors, overlayRef]);

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [measure, revision]);

  return placements;
}
