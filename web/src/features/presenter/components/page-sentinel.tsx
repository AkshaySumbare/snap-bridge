/**
 * The end of what has been fetched, and the thing that asks for more.
 *
 * Sits after the last loaded page of a document that has more behind it. When
 * it comes near the viewport the next window is requested — a long way before
 * it is actually reached, so in ordinary reading the pages are already there
 * and the seam is never visible.
 */

import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * How early to ask. Roughly a screen and a half of lead time: enough for the
 * request to land during a normal scroll, not so much that opening a document
 * pulls half of it down unread.
 */
const LEAD_IN = "1200px";

interface PageSentinelProps {
  documentId: string;
  loaded: number;
  total: number;
  onReach: (documentId: string) => void;
}

export function PageSentinel({ documentId, loaded, total, onReach }: PageSentinelProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    /**
     * Nothing to observe with, so nothing is observed.
     *
     * jsdom has no IntersectionObserver, and neither do a handful of older
     * browsers. Constructing one blindly threw during render and took the
     * whole reader down with it — a missing convenience became a blank pane.
     * Here the pages simply do not auto-load; everything already fetched
     * still reads normally.
     */
    if (typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onReach(documentId);
      },
      { rootMargin: LEAD_IN },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // `loaded` is a dependency on purpose: each window that lands moves this
    // element down the page, and the observer has to be asked again about its
    // new position. Without it a single fetch would be all that ever happened.
  }, [documentId, loaded, onReach]);

  return (
    <div ref={ref} className="flex items-center justify-center gap-2 py-6 text-xs text-text-muted">
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      Loading pages {loaded + 1}–{total}…
    </div>
  );
}
