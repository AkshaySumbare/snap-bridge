/**
 * Resolves passage anchors to points inside the reader's scrolling content.
 *
 * Coordinates are relative to the content wrapper, not the viewport, so the
 * SVG that draws the lines can live inside the same scroller and simply move
 * with the text — no per-scroll re-measure, unlike the connector layer that
 * has to span two independently scrolling panes.
 *
 * Positions only shift when the content itself is re-laid out, so the measure
 * runs on collapse, document, search and resize rather than on scroll.
 */

import { useCallback, useEffect, useState } from "react";

import type { PassageAnchor } from "../types";

export interface ResolvedPoint {
  x: number;
  y: number;
}

export type PointMap = Record<string, ResolvedPoint>;

/** Key an anchor by the paragraph it hangs off plus its position in it. */
export function anchorKey(anchor: PassageAnchor): string {
  return `${anchor.paragraphId}:${anchor.ratioX.toFixed(3)}:${anchor.ratioY.toFixed(3)}`;
}

export function usePassageAnchors(
  contentRef: React.RefObject<HTMLElement>,
  anchors: readonly PassageAnchor[],
  revision: unknown,
): { points: PointMap; contentHeight: number } {
  const [points, setPoints] = useState<PointMap>({});
  const [contentHeight, setContentHeight] = useState(0);

  const measure = useCallback(() => {
    const content = contentRef.current;
    if (!content) return;

    const origin = content.getBoundingClientRect();
    const next: PointMap = {};

    for (const anchor of anchors) {
      const node = content.querySelector<HTMLElement>(
        `[data-paragraph-id="${anchor.paragraphId}"]`,
      );
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      next[anchorKey(anchor)] = {
        x: rect.left - origin.left + rect.width * anchor.ratioX,
        y: rect.top - origin.top + rect.height * anchor.ratioY,
      };
    }

    setPoints((previous) => {
      const keys = Object.keys(next);
      if (
        keys.length === Object.keys(previous).length &&
        keys.every((key) => {
          const before = previous[key];
          const after = next[key];
          return before && after && before.x === after.x && before.y === after.y;
        })
      ) {
        return previous;
      }
      return next;
    });
    setContentHeight(content.scrollHeight);
  }, [anchors, contentRef]);

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    schedule();
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
    };
  }, [measure, revision]);

  return { points, contentHeight };
}
