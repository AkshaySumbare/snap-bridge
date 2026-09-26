import mongoose from "mongoose";

import Presenter from "../../models/presenter/presenter.model.js";

/**
 * The sync cursor: a counter per case, not a clock.
 *
 * Every row a device pulls carries the `serverSeq` of the batch that wrote it,
 * and the cursor a device stores is simply the highest one it has seen. That
 * replaced the old `serverUpdatedAt` cursor (see git history, f03f47a).
 * `serverUpdatedAt` stays on the rows as the readable "when".
 *
 * ── Allocated is not the same as written ────────────────────────────────────
 *
 * A sequence is taken from the counter *before* the rows that carry it are
 * written. Between the `$inc` and the last write of that batch, `case.seq`
 * already names a number whose rows are not all in the database. A reader
 * that used `case.seq` as its ceiling in that window — a colleague's pull, a
 * bootstrap, a manifest — pulled the half that had landed, handed back a
 * cursor at that number, and the other half sat below every device's cursor
 * for ever.
 *
 * So every allocation is a lease. It is recorded in `case.seqPending` in the
 * same atomic update that allocates it, and removed when the writer is done.
 * Readers never go past the lowest sequence still being written: the
 * *visible* ceiling is `min(pending) - 1`, or `seq` when nothing is in flight.
 * Writers may finish in any order; the ceiling only moves once everything
 * below it is written.
 *
 * A writer that dies without releasing would pin the ceiling for good, so a
 * lease also expires: after `SEQ_LEASE_MS` readers ignore it and the next
 * allocation prunes it. That is far above any real write — a sync batch is at
 * most 1,000 nodes behind a 120s gateway timeout.
 */

export const SEQ_LEASE_MS = 3 * 60 * 1000;

export interface PendingSeq {
  seq: number;
  at: Date | string;
}

export interface SeqCaseRow {
  seq?: number;
  seqPending?: PendingSeq[];
}

export interface SeqStamp {
  serverSeq: number;
  serverUpdatedAt: Date;
}

/** The case disappeared (purged) while a request was writing into it. */
export class PresenterGoneError extends Error {
  code = "PRESENTER_NOT_FOUND";
  constructor() {
    super("Case no longer exists");
  }
}

/**
 * The highest sequence a reader may use as its ceiling right now.
 *
 * Pure, so the rule can be tested without a database. Never goes down as
 * leases come and go: a new lease is always above every older sequence, and
 * leases only ever leave (released or expired).
 */
export const computeVisibleSeq = (row: SeqCaseRow | null | undefined, now = Date.now()): number => {
  const seq = row?.seq ?? 0;
  let ceiling = seq;
  for (const pending of row?.seqPending ?? []) {
    const at = new Date(pending.at).getTime();
    // An expired lease belonged to a writer that is gone; it holds nobody back.
    if (!Number.isFinite(at) || now - at >= SEQ_LEASE_MS) continue;
    if (pending.seq - 1 < ceiling) ceiling = pending.seq - 1;
  }
  return Math.max(0, ceiling);
};

/**
 * Take the next sequence and record it as in flight — one atomic update, so no
 * reader can ever see the new `seq` without also seeing its lease. Expired
 * leases are pruned in the same update.
 */
export const allocateSeq = async (presenterId: mongoose.Types.ObjectId): Promise<number> => {
  const row = await Presenter.findOneAndUpdate(
    { _id: presenterId },
    [
      { $set: { seq: { $add: [{ $ifNull: ["$seq", 0] }, 1] } } },
      {
        $set: {
          seqPending: {
            $concatArrays: [
              {
                $filter: {
                  input: { $ifNull: ["$seqPending", []] },
                  as: "pending",
                  cond: { $gt: ["$$pending.at", { $subtract: ["$$NOW", SEQ_LEASE_MS] }] },
                },
              },
              [{ seq: "$seq", at: "$$NOW" }],
            ],
          },
        },
      },
    ],
    { new: true, projection: { seq: 1 } },
  ).lean<{ seq?: number }>();
  // Purged mid-request: writing on would upsert rows for a case that is gone.
  if (!row || typeof row.seq !== "number") throw new PresenterGoneError();
  return row.seq;
};

/** The writer is done with this sequence; readers may now go past it. */
export const releaseSeq = async (presenterId: mongoose.Types.ObjectId, seq: number): Promise<void> => {
  try {
    await Presenter.updateOne({ _id: presenterId }, { $pull: { seqPending: { seq } } });
  } catch (error) {
    // Not fatal: the lease expires on its own; readers are held back until then.
    console.warn(`[presenter] could not release seq ${seq} on case ${presenterId}`, error);
  }
};

/**
 * Allocate, run the writes that carry the sequence, release — whatever happens.
 * Every writer of a pulled collection goes through here.
 */
export const withSeq = async <T>(
  presenterId: mongoose.Types.ObjectId,
  write: (stamp: SeqStamp) => Promise<T>,
): Promise<T> => {
  const seq = await allocateSeq(presenterId);
  try {
    return await write({ serverSeq: seq, serverUpdatedAt: new Date() });
  } finally {
    await releaseSeq(presenterId, seq);
  }
};

/** The case's visible ceiling, plus any other fields the caller wants off the row. */
export const readVisibleSeq = async <T extends object = Record<string, never>>(
  presenterId: mongoose.Types.ObjectId,
  extra: Record<string, 1> = {},
): Promise<{ visible: number; row: (SeqCaseRow & T) | null }> => {
  const row = await Presenter.findById(presenterId, { seq: 1, seqPending: 1, ...extra }).lean<
    SeqCaseRow & T
  >();
  return { visible: computeVisibleSeq(row), row: row ?? null };
};
