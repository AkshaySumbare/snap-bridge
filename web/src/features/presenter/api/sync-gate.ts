/**
 * A gate between the last write of one visit and the first read of the next.
 *
 * Leaving Presenter flushes whatever the reader just did, and coming back
 * re-reads the case from scratch. Both are right on their own, but they race:
 * a bootstrap that overtakes the flush answers from before the last edit, and
 * because it *replaces* the store, that edit disappears from the canvas while
 * still sitting in the database — the worst kind of wrong, since nothing on
 * screen suggests a reload would bring it back.
 *
 * So the read waits for the write. The chain is module-level rather than a
 * ref because the two live in different component trees at different times:
 * by the time the bootstrap runs, the hook that queued the flush is gone.
 */

let pending: Promise<unknown> = Promise.resolve();

/**
 * The live sync loop's flush, while a case is open.
 *
 * `settledWrites` only waits for flushes that were already queued. That is
 * enough when the reader navigates away — the unmount queued one on the way
 * out — but not when a refetch fires on its own, which is what a reconnect
 * does: nothing has queued anything, the reader has unpushed edits sitting in
 * the store, and the bootstrap that lands replaces the project and re-seeds the
 * sync baseline from the server's answer. The diff then reads as zero and those
 * edits are gone, silently, with the status chip showing "saved".
 *
 * So a read can ask for a flush rather than only waiting for one.
 */
let flusher: (() => Promise<unknown>) | null = null;

/** Registered by the sync loop for as long as a case is open. */
export function registerFlusher(fn: (() => Promise<unknown>) | null): void {
  flusher = fn;
}

/**
 * Push anything outstanding, then resolve. Never rejects.
 *
 * Used by the case read, so that whatever it hydrates from already contains the
 * reader's own unpushed work.
 */
export function flushPendingWrites(): Promise<unknown> {
  const run = flusher
    ? Promise.resolve()
        .then(flusher)
        .catch(() => undefined)
    : Promise.resolve();
  pending = pending.then(() => run).catch(() => undefined);
  return pending;
}

/** Hold the next case read until this write has landed. */
export function holdReadsFor(work: Promise<unknown>): void {
  // Failures are swallowed deliberately: a push that could not land must not
  // block every future read of the case behind a rejected promise.
  pending = pending.then(() => work).catch(() => undefined);
}

/** Resolves once nothing is outstanding. Never rejects. */
export function settledWrites(): Promise<unknown> {
  return pending;
}
