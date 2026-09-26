import type { IPresenterDocument } from "../../../models/presenter/presenterDocument.model.js";

/**
 * What a document's parse state actually is, as opposed to what was last
 * written down.
 *
 * Nothing sweeps for abandoned parses any more, so a process that dies
 * mid-extraction leaves `running` behind it forever. Rather than a background
 * job to tidy that up, staleness is worked out on the way out: a claim older
 * than the timeout is reported as `stalled`, and the reader is offered a
 * retry instead of a spinner that will never stop.
 *
 * A read-only derivation — no write, no job, no clock skew between instances.
 */

export const STALE_CLAIM_MS = 15 * 60 * 1000;

export type EffectiveParseStatus =
  | "pending"
  | "running"
  | "ready"
  | "failed"
  /** Claimed, then nothing. The process that took it is gone. */
  | "stalled";

export const effectiveParseStatus = (
  parse: IPresenterDocument["parse"],
  now = Date.now(),
): EffectiveParseStatus => {
  if (parse.status !== "running") return parse.status;
  const startedAt = parse.startedAt ? new Date(parse.startedAt).getTime() : 0;
  return now - startedAt > STALE_CLAIM_MS ? "stalled" : "running";
};

/**
 * Can the reader do anything about it?
 *
 * Uncapped on purpose: nothing retries by itself, so the answer never becomes
 * "no, you have used up your tries" — a document that will not open has to
 * stay askable, however many times it has been asked.
 */
export const isRetryable = (status: EffectiveParseStatus): boolean =>
  status === "failed" || status === "stalled";

/** The parse block as the API reports it, with the derived status folded in. */
export const presentParse = (parse: IPresenterDocument["parse"], now = Date.now()) => {
  const status = effectiveParseStatus(parse, now);
  return {
    ...(typeof (parse as { toObject?: () => unknown }).toObject === "function"
      ? ((parse as unknown as { toObject: () => object }).toObject() as object)
      : parse),
    status,
    canRetry: isRetryable(status),
  };
};
