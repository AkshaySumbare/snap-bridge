/**
 * Keeps the reader's work and the server in step, both ways.
 *
 * The web is a chatty client by design: it pushes a small batch each time the
 * reader pauses, rather than the offline backlog a phone sends. Debounced, so
 * a burst of edits is one request; queued, so a change made while a push is in
 * flight is not lost behind it. Every push also pulls, and a quiet timer polls
 * so a case left open still catches what a colleague did.
 */

import { useEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api/errors";

import type { LiquidProject } from "../types";
import { useLiquidTextStore } from "../stores/liquid-text-store";
import { mergeDelta } from "./merge-delta";
import { pushSync } from "./presenter-api";
import { diffForSync, emptySnapshot, snapshotOf, type SyncSnapshot } from "./sync-diff";
import { holdReadsFor, registerFlusher } from "./sync-gate";

/** How long the reader has to stop before their work is sent. */
const DEBOUNCE_MS = 900;

/**
 * How often a case left open checks for other people's work.
 *
 * A push already returns whatever changed, so this only matters while the
 * reader is reading rather than editing — which is most of the time in a
 * reading tool.
 */
const POLL_MS = 15_000;

/**
 * What the reader needs to know about whether their work is safe.
 *
 *   - `idle`    — everything the reader has done is on the server.
 *   - `saving`  — a push is in flight. Ordinary; worth showing quietly.
 *   - `unsaved` — a push failed and will be tried again. Recoverable, but the
 *                 reader must not be left believing it landed.
 *   - `blocked` — the server refused in a way retrying cannot fix, which in
 *                 practice means the session expired. Retrying forever would
 *                 be a very quiet way to lose an afternoon.
 */
export type SyncStatus = "idle" | "saving" | "unsaved" | "blocked";

export interface PresenterSync {
  status: SyncStatus;
  /** How many changes are waiting to reach the server. */
  pending: number;
}

export function usePresenterSync(
  presenterId: string | null,
  initialCursor: string | null,
  enabled: boolean,
  hydratedAt: number,
  hydratedProject: Omit<LiquidProject, "updatedAt"> | null,
): PresenterSync {
  const active = enabled && Boolean(presenterId);

  const snapshot = useRef<SyncSnapshot>(emptySnapshot());
  const cursor = useRef<string | null>(initialCursor);
  const inFlight = useRef(false);
  const dirtyAgain = useRef(false);
  /**
   * State, not a ref.
   *
   * This was a ref, and the view discarded it — so a failed save updated a
   * value nobody read and nothing re-rendered. A reader could work for an
   * hour against an expired session, watch every edit appear on screen, and
   * find none of it there the next day. Anything that reports on the reader's
   * work has to be able to cause a render.
   */
  const [state, setState] = useState<PresenterSync>({ status: "idle", pending: 0 });

  /**
   * The baseline is the state as it arrived from the server. Without seeding
   * it, the first edit would diff against nothing and re-send the entire
   * case as if the reader had just typed all of it.
   *
   * Re-seeded on every hydration, including the re-read that happens when the
   * reader comes back. Hydration replaces the project wholesale, so a stale
   * baseline would make the next diff read that replacement as deletions and
   * tombstone perfectly good rows.
   */
  useEffect(() => {
    if (!active) return;
    cursor.current = initialCursor;
    /*
     * The server's own answer, not whatever the store holds by now.
     *
     * This effect runs a render or more after hydration, and the reader can
     * have annotated in between — a case opens with its text already on
     * screen. Snapshotting the store then quietly adopted that annotation as
     * the baseline: no diff, no push, and a highlight that survives on screen
     * until the tab closes.
     */
    snapshot.current = snapshotOf(hydratedProject ?? useLiquidTextStore.getState().project);
  }, [active, presenterId, initialCursor, hydratedAt, hydratedProject]);

  useEffect(() => {
    if (!active || !presenterId) return undefined;

    let timer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Fold in what everyone else did.
     *
     * Applied only when the reader has nothing of their own outstanding: a
     * merge that overwrote a half-typed note because a colleague touched the
     * same case would be worse than being a few seconds behind. If there is
     * local work, the next push carries it and the pull after that lands
     * cleanly.
     */
    const applyPull = (response: Awaited<ReturnType<typeof pushSync>>) => {
      const changed = Object.values(response.pull).reduce(
        (total, nodes) => total + (nodes?.length ?? 0),
        0,
      );
      if (changed === 0 && response.documents.length === 0) return;

      const store = useLiquidTextStore.getState();

      /**
       * Always merged — but never over the reader's own outstanding work.
       *
       * This used to drop the whole pull whenever the reader had anything
       * unpushed, and advance the cursor anyway. The rows were then never
       * offered again: a colleague's afternoon of work, or a tablet's batch
       * back from three days offline, arrived once and was discarded because
       * someone happened to be mid-sentence.
       *
       * The narrower rule is the one that was actually wanted: skip the
       * handful of nodes the reader is editing right now — those are about to
       * be pushed and will be resolved by last-write-wins on the server — and
       * take everything else.
       */
      const { changes } = diffForSync(store.project, snapshot.current);
      const locallyDirty = new Set<string>();
      for (const nodes of Object.values(changes)) {
        for (const node of nodes ?? []) locallyDirty.add(String(node._id));
      }

      /**
       * Merged, not replaced. The pull is a delta — treating it as a snapshot
       * rebuilt the canvas from the last few seconds of changes and dropped
       * every Point that had not moved, which read as work vanishing while
       * the database still held it.
       */
      store.applyServerDelta(
        mergeDelta(store.project, response.pull, response.documents, locallyDirty),
      );

      /*
       * Re-snapshot only what was not skipped: a node held back is still
       * pending and must stay in the next diff, so its old baseline entry is
       * kept rather than adopting the merged state as already-pushed.
       */
      const merged = snapshotOf(useLiquidTextStore.getState().project);
      for (const id of locallyDirty) {
        const previous = snapshot.current.nodes.get(id);
        if (previous === undefined) merged.nodes.delete(id);
        else merged.nodes.set(id, previous);
      }
      snapshot.current = merged;
    };

    const flush = async (options?: { evenIfUnchanged?: boolean }) => {
      if (inFlight.current) {
        // Something changed mid-push. Remember, and go again when it lands —
        // pushing concurrently would race two diffs against one baseline.
        dirtyAgain.current = true;
        return;
      }

      const project = useLiquidTextStore.getState().project;
      const { changes, next, count } = diffForSync(project, snapshot.current);
      // A poll still goes: an empty batch is how this client asks "what did
      // anyone else do?".
      if (count === 0 && !options?.evenIfUnchanged) return;

      inFlight.current = true;
      setState({ status: "saving", pending: count });
      try {
        const response = await pushSync(presenterId, { since: cursor.current, changes });
        cursor.current = response.cursor;
        // Only now: a snapshot advanced before the server agreed would lose
        // every change in the batch if the request failed.
        snapshot.current = next;
        applyPull(response);
        setState({ status: "idle", pending: 0 });
      } catch (error) {
        /*
         * Refused, not merely failed.
         *
         * A network blip is worth retrying and says nothing to the reader
         * beyond "not saved yet". A 401 or 403 will refuse identically
         * forever, so the reader has to be told to do something about it —
         * every quiet retry after that is another minute of work they think
         * is safe.
         */
        const refused = error instanceof ApiError && (error.status === 401 || error.status === 403);
        setState({ status: refused ? "blocked" : "unsaved", pending: count });
      } finally {
        inFlight.current = false;
        if (dirtyAgain.current) {
          dirtyAgain.current = false;
          void flush();
        }
      }
    };

    /*
     * Offered to the case read, so a refetch pushes before it replaces.
     *
     * Registered for as long as this case is open and cleared on the way out;
     * `flushPendingWrites` is a no-op when nothing is registered, which is the
     * state between cases.
     */
    registerFlusher(() => flush());

    const unsubscribe = useLiquidTextStore.subscribe((current, previous) => {
      if (current.project === previous.project) return;
      /*
       * Only the reader's own work restarts the clock.
       *
       * The project changes for things the reader did not do — most often a
       * window of page text landing, which is the server's content arriving,
       * carries nothing to push, and appears in no diff. Restarting the
       * debounce on those meant a reader who highlighted a passage and then
       * scrolled had their highlight held back for as long as they kept
       * scrolling, because every window that arrived pushed the save another
       * 900ms into the future. Annotations are what this exists to save.
       */
      if (diffForSync(current.project, snapshot.current).count === 0) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), DEBOUNCE_MS);
    });

    /*
     * Anything already outstanding when this starts watching.
     *
     * Sync only begins once the case has hydrated, and a case opens with its
     * text on screen — so a reader can highlight a passage in the moment
     * before this effect runs, and that highlight arrives to no subscriber
     * and schedules no push. It would then sit unsaved until the reader
     * happened to touch the case again. A no-op when nothing is outstanding,
     * which is the ordinary case.
     */
    void flush();

    /**
     * A quiet poll, so a case left open still catches a colleague's work.
     * `flush` with nothing local to send is a pull with an empty batch.
     */
    const poll = setInterval(() => void flush({ evenIfUnchanged: true }), POLL_MS);

    return () => {
      unsubscribe();
      clearInterval(poll);
      if (timer) clearTimeout(timer);
      // A push already in flight is left to finish: the reader closing a case
      // should not throw away the edit they just made. The next bootstrap
      // waits on it, so coming straight back cannot read past it.
      holdReadsFor(flush());
      registerFlusher(null);
    };
  }, [active, presenterId]);

  /**
   * Do not let the tab close on work that never reached the server.
   *
   * The unmount flush is fire-and-forget and a closing tab does not wait for
   * it, so without this the last edits of a session can leave with the
   * window. The browser shows its own wording — the only thing a page can do
   * is ask for the prompt at all.
   */
  const atRisk = state.status === "unsaved" || state.status === "blocked";
  useEffect(() => {
    if (!atRisk) return undefined;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy engines need a returned string to raise the dialog.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [atRisk]);

  return state;
}
