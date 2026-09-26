/**
 * Whether the screen is too narrow for the three-pane workspace.
 *
 * Presenter keeps its own threshold rather than sharing the app-wide
 * `useIsMobile` (768px), because it needs far more width than an ordinary
 * page: the rail will not go under 248px and the canvas not under 320px, so
 * at 768 the reader is left with 200px — enough to lay out, nowhere near
 * enough to read a PDF in. Below 1024 the panes are shown one at a time.
 *
 * Kept local to the feature on purpose: raising this number is a statement
 * about Presenter's layout, and must not silently move every other screen
 * that asks whether it is on a phone.
 */

import { useEffect, useState } from "react";

export const NARROW_BREAKPOINT = 1024;

export function useNarrowLayout(): boolean {
  // Assume wide until measured. The server has no viewport, and guessing
  // narrow would flash the single-pane layout on every desktop load.
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT - 1}px)`);
    const sync = () => setNarrow(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return narrow;
}
