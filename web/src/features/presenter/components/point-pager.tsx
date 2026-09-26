/**
 * The numbered strip that selects which Point the workspace is showing.
 *
 * One Point at a time, chosen by number. Past ten Points the strip pages
 * rather than growing — the tabs stay a fixed, scannable width instead of
 * shrinking toward illegibility, and Prev/Next move the run of numbers.
 *
 * Paging follows the selection: choosing a Point outside the visible run
 * (a new one, or a jump from elsewhere) scrolls the strip to include it, so
 * the highlighted tab is never off-screen.
 *
 * The numbers are also the order, and can be dragged. Dropping one tab on
 * another takes that position: drag 9 onto 1 and it becomes 1, with the rest
 * sliding down. Order is the position in the array, so this is the entire
 * change — the sync diff sends the new index like any other edit.
 */

/**
 * How long a tab has to be held over Prev/Next before the strip pages.
 *
 * Native drag has no notion of scrolling to reach an off-screen target, so
 * without this a Point could only ever be moved within the ten on screen.
 */
const SPRING_MS = 600;

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { POINTS_PER_PAGE } from "../constants";
import { useLiquidTextStore } from "../stores/liquid-text-store";
import { useLiquidTextUiStore } from "../stores/liquid-text-ui-store";
import type { NoteWrapper } from "../types";

interface PointPagerProps {
  wrappers: readonly NoteWrapper[];
  activeWrapperId: string | null;
}

export function PointPager({ wrappers, activeWrapperId }: PointPagerProps) {
  const windowStart = useLiquidTextUiStore((state) => state.pointWindowStart);
  const setWindowStart = useLiquidTextUiStore((state) => state.setPointWindowStart);
  const setActiveWrapper = useLiquidTextUiStore((state) => state.setActiveWrapper);
  const reorderWrapper = useLiquidTextStore((state) => state.reorderWrapper);

  /** The Point being dragged, and the tab it is currently over. */
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const springTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelSpring = () => {
    if (springTimer.current) clearTimeout(springTimer.current);
    springTimer.current = null;
  };

  const endDrag = () => {
    cancelSpring();
    setDraggingId(null);
    setOverIndex(null);
  };

  // A drag abandoned outside the strip still has to let go of its state.
  useEffect(() => cancelSpring, []);

  /**
   * Hold over Prev/Next to page while dragging, so a Point can be moved to a
   * position that is not currently on screen.
   */
  const spring = (to: number, enabled: boolean) => {
    if (!draggingId || !enabled || springTimer.current) return;
    springTimer.current = setTimeout(() => {
      springTimer.current = null;
      setWindowStart(to);
    }, SPRING_MS);
  };

  /** Move the selected Point one place, for anyone not using a mouse. */
  const nudge = (wrapperId: string, index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= wrappers.length) return;
    reorderWrapper(wrapperId, to);
  };

  const activeIndex = wrappers.findIndex((wrapper) => wrapper.id === activeWrapperId);
  const lastStart = Math.max(0, wrappers.length - POINTS_PER_PAGE);
  const start = Math.min(windowStart, lastStart);
  const visible = wrappers.slice(start, start + POINTS_PER_PAGE);

  // Keep the selected tab inside the visible run — otherwise creating an
  // eleventh Point would select a tab the reader cannot see.
  useEffect(() => {
    if (activeIndex < 0) return;
    if (activeIndex < start) setWindowStart(activeIndex);
    else if (activeIndex >= start + POINTS_PER_PAGE) {
      setWindowStart(activeIndex - POINTS_PER_PAGE + 1);
    }
  }, [activeIndex, start, setWindowStart]);

  if (wrappers.length === 0) return null;

  const paged = wrappers.length > POINTS_PER_PAGE;
  const stepper =
    "flex items-center gap-1 rounded-md border border-border-default px-2.5 py-1 text-[11px] font-medium transition-colors";

  return (
    <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border-subtle bg-surface-raised px-3 py-2">
      {visible.map((wrapper, offset) => {
        const index = start + offset;
        const number = index + 1;
        const isActive = wrapper.id === activeWrapperId;
        const isDragging = wrapper.id === draggingId;
        const isTarget = draggingId !== null && !isDragging && overIndex === index;

        return (
          <button
            key={wrapper.id}
            type="button"
            draggable
            onClick={() => setActiveWrapper(wrapper.id)}
            onDragStart={(event) => {
              setDraggingId(wrapper.id);
              // Firefox starts no drag at all without data on the transfer.
              event.dataTransfer.setData("text/plain", wrapper.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={endDrag}
            onDragOver={(event) => {
              if (!draggingId || isDragging) return;
              // Without this the browser refuses the drop outright.
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setOverIndex(index);
            }}
            onDragLeave={() => setOverIndex((current) => (current === index ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              // Dropping on a tab takes that number: the dragged Point ends up
              // at this index, and the ones it passed slide over by one.
              if (draggingId && !isDragging) reorderWrapper(draggingId, index);
              endDrag();
            }}
            onKeyDown={(event) => {
              // Native drag has no keyboard path at all, so the same move is
              // offered as a modifier — otherwise the order would be
              // unreachable without a mouse.
              if (!event.altKey) return;
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                nudge(wrapper.id, index, -1);
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                nudge(wrapper.id, index, 1);
              }
            }}
            aria-current={isActive ? "true" : undefined}
            title={`${wrapper.title} — drag to reorder, or Alt + ← / →`}
            className={cn(
              "flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-md border text-[12px] font-semibold tabular-nums transition-colors active:cursor-grabbing",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border-default text-text-secondary hover:bg-surface-sunken hover:text-foreground",
              // The tab being carried fades; the one it would land on is
              // ringed, so the number it is about to take is unambiguous.
              isDragging && "opacity-40",
              isTarget && "ring-2 ring-primary ring-offset-1 ring-offset-surface-raised",
            )}
          >
            {number}
          </button>
        );
      })}

      {paged && (
        <>
          <button
            type="button"
            onClick={() => setWindowStart(start - POINTS_PER_PAGE)}
            onDragOver={(event) => {
              if (!draggingId) return;
              event.preventDefault();
              spring(start - POINTS_PER_PAGE, start > 0);
            }}
            onDragLeave={cancelSpring}
            disabled={start === 0}
            className={cn(
              stepper,
              start === 0
                ? "cursor-not-allowed text-text-muted opacity-50"
                : "text-text-secondary hover:bg-surface-sunken hover:text-foreground",
            )}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev
          </button>
          <button
            type="button"
            onClick={() => setWindowStart(start + POINTS_PER_PAGE)}
            onDragOver={(event) => {
              if (!draggingId) return;
              event.preventDefault();
              spring(start + POINTS_PER_PAGE, start < lastStart);
            }}
            onDragLeave={cancelSpring}
            disabled={start >= lastStart}
            className={cn(
              stepper,
              start >= lastStart
                ? "cursor-not-allowed text-text-muted opacity-50"
                : "text-text-secondary hover:bg-surface-sunken hover:text-foreground",
            )}
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
