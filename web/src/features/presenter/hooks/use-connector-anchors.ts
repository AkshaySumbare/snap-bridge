/**
 * Measures where connectors should start and end.
 *
 * The reader and the canvas are independent scrollers, so an excerpt card's
 * link to its source highlight can't be expressed in either one's coordinate
 * space. Instead a single overlay spans both panes and everything is measured
 * against it: highlights are found by `data-highlight-id`, cards by
 * `data-card-id`.
 *
 * Measurement is layout-read-only and rAF-throttled, and re-runs on scroll
 * (captured, so inner scrollers fire it), on resize, and whenever the caller
 * bumps `revision` — which the view does on any change that can move an
 * anchor (zoom, collapse level, card list, active document).
 */

import { useCallback, useEffect, useState } from "react";

import { CONNECTOR_DOT_RADIUS } from "../constants";
import type { PassageAnchor } from "../types";
import type { Point } from "../utils/geometry";
import { anchorKey } from "./use-passage-anchors";

export interface AnchorMap {
  /** Right edge of the source highlight, where the connector leaves the page. */
  highlights: Record<string, Point>;
  /**
   * Points inside a paragraph, keyed by `anchorKey` — for notes pinned to a
   * passage that carries no highlight.
   */
  passagePoints: Record<string, Point>;
  /** Left and right edge midpoints of each card. */
  cardsLeft: Record<string, Point>;
  cardsRight: Record<string, Point>;
  /**
   * Outer edge of each reference's notch, keyed `cardId:linkId`. A card can
   * carry several references, each with its own tab — landing every line on
   * the card's own edge drew them all onto whichever tab happened to be
   * first.
   */
  linkNotches: Record<string, Point>;
}

const EMPTY: AnchorMap = {
  highlights: {},
  passagePoints: {},
  cardsLeft: {},
  cardsRight: {},
  linkNotches: {},
};

export function useConnectorAnchors(
  overlayRef: React.RefObject<HTMLElement>,
  /** Passage anchors currently in play; measured alongside the highlights. */
  passageAnchors: readonly PassageAnchor[],
  revision: unknown,
): AnchorMap {
  const [anchors, setAnchors] = useState<AnchorMap>(EMPTY);

  const measure = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const origin = overlay.getBoundingClientRect();

    const next: AnchorMap = {
      highlights: {},
      passagePoints: {},
      cardsLeft: {},
      cardsRight: {},
      linkNotches: {},
    };

    for (const anchor of passageAnchors) {
      const node = overlay.ownerDocument.querySelector<HTMLElement>(
        `[data-paragraph-id="${anchor.paragraphId}"]`,
      );
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      next.passagePoints[anchorKey(anchor)] = {
        x: rect.left - origin.left + rect.width * anchor.ratioX,
        y: rect.top - origin.top + rect.height * anchor.ratioY,
      };
    }

    overlay.ownerDocument.querySelectorAll<HTMLElement>("[data-highlight-id]").forEach((node) => {
      const id = node.dataset.highlightId;
      if (!id) return;
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      // Last run of a multi-span highlight wins — the connector should leave
      // from the end of the passage, which reads as "this bit, continued".
      next.highlights[id] = {
        x: rect.right - origin.left,
        y: rect.top + rect.height / 2 - origin.top,
      };
    });

    overlay.ownerDocument.querySelectorAll<HTMLElement>("[data-card-id]").forEach((node) => {
      const id = node.dataset.cardId;
      if (!id) return;
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const y = rect.top + Math.min(rect.height / 2, 28) - origin.top;
      // The line lands on the notch when the card has one — just outside its
      // left border, touching it, rather than crossing into the tab. Falling
      // back to the card's own edge keeps cards without notches connectable.
      const notch = node.querySelector<HTMLElement>(`[data-card-notch="${id}"]`);
      const notchRect = notch?.getBoundingClientRect();
      next.cardsLeft[id] =
        notchRect && notchRect.width > 0
          ? {
              x: notchRect.left - origin.left - CONNECTOR_DOT_RADIUS,
              y: notchRect.top + Math.min(notchRect.height / 2, 10) - origin.top,
            }
          : { x: rect.left - origin.left, y };
      next.cardsRight[id] = { x: rect.right - origin.left, y };
    });

    overlay.ownerDocument.querySelectorAll<HTMLElement>("[data-link-notch]").forEach((node) => {
      const key = node.dataset.linkNotch;
      if (!key) return;
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      next.linkNotches[key] = {
        // A dot's radius clear of the border, so it rests against the notch.
        x: rect.left - origin.left - CONNECTOR_DOT_RADIUS,
        y: rect.top + Math.min(rect.height / 2, 10) - origin.top,
      };
    });

    setAnchors(next);
  }, [overlayRef, passageAnchors]);

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

  return anchors;
}
