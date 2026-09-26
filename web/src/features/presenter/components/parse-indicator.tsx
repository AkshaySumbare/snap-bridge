/**
 * What the server has made of a PDF, shown beside it in the rail.
 *
 * Two exports rather than one, because a rail row is itself a button — the
 * whole row shows that document — and a retry button nested inside it is
 * markup no browser accepts. `ParseBadge` is text and lives under the title;
 * `ParseRetry` is the control and sits outside the row's button.
 *
 * Extraction runs behind the upload, so a document exists in the rail before
 * its text does. Without this the reader was shown a document that opened
 * blank, with nothing to say whether it was still being read, had failed, or
 * had been abandoned by a process that died — and no way to ask again.
 *
 * The poll lives here rather than in the rail because it must stop on its
 * own: a component that renders nothing once a document is ready is also one
 * that has stopped asking.
 */

import { AlertTriangle, Loader2, RotateCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "@/lib/sonner";

import { useParseStatus, useRetryParse } from "../api/use-presenter";
import { useLiquidTextStore } from "../stores/liquid-text-store";
import type { LiquidDocument } from "../types";

const WORKING = new Set(["pending", "running"]);

interface ParseIndicatorProps {
  document: LiquidDocument;
}

export function ParseBadge({ document }: ParseIndicatorProps) {
  const presenterId = useLiquidTextStore((state) => state.project.id);
  const setDocumentParse = useLiquidTextStore((state) => state.setDocumentParse);

  const { status } = document.parse;
  const settled = status === "ready";

  // Polled only while there is something to wait for. `useParseStatus` stops
  // on any terminal state, including `stalled`, so a dead parse does not spin
  // forever — it becomes a retry.
  const poll = useParseStatus(presenterId, document.id, !settled);

  /**
   * Each answer is applied once, and only once.
   *
   * Keyed on when the response arrived rather than on its contents, because
   * the store can move for reasons the poll has not heard about yet — a retry
   * the reader just pressed, most of all. Re-applying an answer already taken
   * would undo that and put the failure straight back on screen, until the
   * next poll agreed with it again a couple of seconds later.
   */
  const appliedAt = useRef(0);
  const polled = poll.data;
  useEffect(() => {
    if (!polled || poll.dataUpdatedAt === appliedAt.current) return;
    appliedAt.current = poll.dataUpdatedAt;
    setDocumentParse(document.id, {
      status: polled.status,
      pageCount: polled.pageCount,
      pagesDone: polled.pagesDone,
      canRetry: polled.canRetry,
      error: polled.error,
    });
  }, [polled, poll.dataUpdatedAt, document.id, setDocumentParse]);

  if (settled) return null;

  if (WORKING.has(status)) {
    const { pagesDone, pageCount } = document.parse;
    /**
     * A real fraction where there is one, and an indeterminate bar where
     * there is not.
     *
     * The page total lands a moment after the file opens, so there is a short
     * window — and the whole of the queue before a worker picks it up — with
     * nothing to divide by. Showing 0% then would read as stuck, so the bar
     * sweeps instead, which says "working, extent unknown" without claiming
     * a number it does not have.
     */
    const known = pageCount > 0;
    const percent = known ? Math.min(100, Math.round((pagesDone / pageCount) * 100)) : 0;

    return (
      <span className="mt-0.5 flex w-full flex-col gap-1">
        <span className="flex items-center justify-between gap-2 text-[10px] text-text-secondary">
          <span className="flex items-center gap-1">
            <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />
            {known ? `Reading ${pagesDone} of ${pageCount} pages` : "Reading…"}
          </span>
          {known && <span className="tabular-nums">{percent}%</span>}
        </span>

        <span
          className="h-1 w-full overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-label={`Reading ${document.title}`}
          // Omitted while the total is unknown, which is what marks a
          // progress bar as indeterminate to a screen reader.
          {...(known ? { "aria-valuenow": percent, "aria-valuemin": 0, "aria-valuemax": 100 } : {})}
        >
          <span
            className={
              known
                ? "block h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                : "block h-full w-1/3 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-primary/60"
            }
            style={known ? { width: `${percent}%` } : undefined}
          />
        </span>
      </span>
    );
  }

  return (
    <span
      className="flex items-center gap-1 rounded bg-destructive/10 px-1 py-px text-[10px] text-destructive"
      title={document.parse.error ?? undefined}
    >
      <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
      {status === "stalled" ? "Reading stopped" : "Could not read"}
    </span>
  );
}

/**
 * The way back from a failed or stalled parse.
 *
 * Nothing retries on its own upstream, by design — the reader is shown the
 * failure and decides — so this is the only way back, and it is offered
 * rather than buried in a menu. There is no limit on asking: a document that
 * will not open is one the reader may well want to try again after fixing
 * something at their end, and a button that stopped working after three goes
 * would strand them.
 */
export function ParseRetry({ document }: ParseIndicatorProps) {
  const presenterId = useLiquidTextStore((state) => state.project.id);
  const setDocumentParse = useLiquidTextStore((state) => state.setDocumentParse);
  const retry = useRetryParse(presenterId);

  if (!document.parse.canRetry) return null;

  return (
    <button
      type="button"
      disabled={retry.isPending}
      aria-label={`Try reading ${document.title} again`}
      title="Try reading this again"
      onClick={(event) => {
        event.stopPropagation();
        // Shown as working straight away: the request is what starts the
        // parse, so waiting for it to return before saying so leaves the
        // reader clicking a button that looks like it did nothing.
        const previous = document.parse;
        setDocumentParse(document.id, {
          ...previous,
          status: "pending",
          canRetry: false,
          error: null,
        });
        retry.mutateAsync(document.id).catch(() => {
          setDocumentParse(document.id, previous);
          toast.error(`Could not start reading “${document.title}” again.`);
        });
      }}
      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted hover:bg-surface-sunken hover:text-destructive disabled:opacity-50"
    >
      <RotateCw className="h-3.5 w-3.5" />
    </button>
  );
}
