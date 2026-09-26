/**
 * Is this element close enough to the viewport to be worth painting?
 *
 * Used to decide which pages keep a canvas. A canvas is a raster bitmap: the
 * browser holds `width × height × 4` bytes for as long as it is sized,
 * whether or not anyone is looking at it. At 2× on US Letter that is 7.4MB a
 * page, so a reader who has scrolled through a 600-page document is holding
 * several gigabytes of pages they walked past hours ago.
 *
 * "Close enough" is generous on purpose — a page starts painting well before
 * it is reached, so scrolling arrives at a finished page rather than watching
 * one appear.
 */

import { useEffect, useState, type RefObject } from "react";

/**
 * How far outside the viewport still counts as near.
 *
 * Roughly two pages either side at a typical reading width. Small enough that
 * memory stays flat, large enough that a fast scroll does not outrun the
 * renderer.
 */
export const NEAR_MARGIN_PX = 2000;

/**
 * Takes either a ref or the element itself.
 *
 * A ref is enough for a node that is there from the first render — a page,
 * say. It is not enough for one that appears later: a ref changing re-runs
 * nothing, so the observer would never be attached to it. Callers in that
 * position hold the node in state (a callback ref) and pass it here, which
 * makes it an ordinary dependency and the observer follows it.
 */
export function useNearViewport(target: RefObject<Element | null> | Element | null): boolean {
  const [near, setNear] = useState(false);

  useEffect(() => {
    const node = target === null || target instanceof Element ? target : target.current;
    if (!node) return undefined;

    /**
     * Without an observer, everything is near.
     *
     * Losing the optimisation is a memory cost; losing the *page* would be a
     * blank reader. Some older engines have no IntersectionObserver, and they
     * should still be able to read the document.
     */
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setNear(entry.isIntersecting);
      },
      { rootMargin: `${NEAR_MARGIN_PX}px 0px` },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [target]);

  return near;
}
