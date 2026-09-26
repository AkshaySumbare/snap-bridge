import mongoose from "mongoose";

import PresenterDocument from "../../models/presenter/presenterDocument.model.js";
import { bumpPresenterCounts } from "./presenter.service.js";
import {
  ENTITIES,
  ENTITY_ORDER,
  type PresenterEntity,
} from "./registry.js";
import {
  buildLwwOp,
  resolveStatuses,
  type LwwContext,
  type NodeResult,
  type SyncNodeInput,
} from "./lww.js";
import { allocateSeq, readVisibleSeq, releaseSeq } from "./seq.js";
import { presentParse } from "./parse/parseStatus.js";

/**
 * Push-and-pull sync.
 *
 * One request reconciles a device: it carries whatever the device changed
 * while it was away, and comes back with both the verdict on each of those
 * changes and everything the rest of the team changed meanwhile. Two round
 * trips would leave a window where the device has pushed but not yet pulled,
 * and would double the cost of the chatty single-node syncs the web makes.
 */

/** A device that has been away longer than tombstones live must resync whole. */
export const TOMBSTONE_RETENTION_DAYS = 90;
/**
 * Cursors from before the sequence change arrive as millisecond timestamps.
 *
 * A sequence will not reach this in any plausible life of a case, so magnitude
 * alone separates the two formats and an old client gets one clean resync.
 */
const LEGACY_MS_CURSOR_FLOOR = 1e12;
export const MAX_BATCH_NODES = 1000;
export const MAX_PULL_NODES = 2000;

export interface SyncRequest {
  presenterId: string;
  deviceId?: string;
  since?: string | null;
  /**
   * What time the device thinks it is, taken as it built the batch.
   *
   * Used only to work out the device's clock offset, which is then applied to
   * every `lastModifiedAt` in the batch. Absent means "assume no skew", which
   * is what happened before this existed.
   */
  deviceNow?: string | number;
  changes?: Partial<Record<PresenterEntity, SyncNodeInput[]>>;
}

export interface SyncResponse {
  serverTime: string;
  cursor: string;
  results: NodeResult[];
  pull: Record<string, unknown[]>;
  documents: unknown[];
  hasMore: boolean;
}

export class CursorExpiredError extends Error {
  code = "CURSOR_EXPIRED";
  /**
   * What the batch managed to write before the cursor was refused.
   *
   * Carried so the device can commit the nodes that landed instead of replaying
   * them blindly after its full resync.
   */
  constructor(public readonly results: NodeResult[] = []) {
    super("Full resync required");
  }
}

export class BatchTooLargeError extends Error {
  code = "BATCH_TOO_LARGE";
  constructor(public readonly maxNodes: number) {
    super(`Batch exceeds ${maxNodes} nodes`);
  }
}

const countNodes = (changes: SyncRequest["changes"]): number =>
  ENTITY_ORDER.reduce((total, entity) => total + (changes?.[entity]?.length ?? 0), 0);

/**
 * How stale a device's cursor is allowed to be.
 *
 * Tombstones older than the retention window have been purged, so a delta can
 * no longer describe what was deleted and the device has to start over. With a
 * sequence cursor there is no timestamp to compare, so the case records the
 * lowest sequence a delta can still be built from; until purge is built that is
 * 0 and nothing expires.
 */
const isCursorExpired = (since: number, fullResyncBefore: number): boolean =>
  since < fullResyncBefore;

/**
 * Read a cursor off the wire.
 *
 * `null`/absent means "send me everything". A value at millisecond magnitude is
 * a cursor from before the sequence change: there is no way to map it onto a
 * sequence, so the device is told to resync once and is then on the new format
 * for good.
 */
export const parseCursor = (
  since: SyncRequest["since"],
): { value: number | null; legacy: boolean } => {
  if (since === null || since === undefined || since === "") return { value: null, legacy: false };
  const value = Number(since);
  if (!Number.isFinite(value) || value < 0) throw new InvalidCursorError();
  /*
   * Reported, not thrown. A legacy cursor is refused only AFTER the batch is
   * written, like any other expired cursor, and the 409 carries `results`.
   * Throwing here refused the batch unapplied, so a device holding a
   * pre-sequence cursor could never upload the work it came back with.
   */
  if (value >= LEGACY_MS_CURSOR_FLOOR) return { value: null, legacy: true };
  return { value, legacy: false };
};

export class InvalidCursorError extends Error {
  code = "INVALID_CURSOR";
}

/** What the database holds for a set of ids: alive, or tombstoned. */
interface KnownIds {
  alive: Set<string>;
  deleted: Set<string>;
}

/**
 * Which parent ids exist, and whether they are alive — counting rows written
 * earlier in this same batch, so a whole offline session (Point, argument,
 * reference, passage all created on the plane) is accepted in one payload.
 */
const collectKnownIds = async (
  entity: PresenterEntity,
  ids: string[],
  presenterId: mongoose.Types.ObjectId,
  writtenThisBatch: Map<string, boolean>,
): Promise<KnownIds> => {
  const known: KnownIds = { alive: new Set(), deleted: new Set() };
  const missing: string[] = [];
  for (const id of new Set(ids)) {
    const deleted = writtenThisBatch.get(id);
    if (deleted === undefined) missing.push(id);
    else (deleted ? known.deleted : known.alive).add(id);
  }
  if (missing.length > 0) {
    const found = await ENTITIES[entity].model
      .find({ _id: { $in: missing }, presenterId }, { _id: 1, isDeleted: 1 })
      .lean<{ _id: string; isDeleted?: boolean }[]>();
    for (const doc of found) {
      (doc.isDeleted === true ? known.deleted : known.alive).add(String(doc._id));
    }
  }
  return known;
};

/** The same question for Presenter documents, which live outside the sync collections. */
const collectKnownDocuments = async (
  ids: string[],
  presenterId: mongoose.Types.ObjectId,
): Promise<KnownIds> => {
  const known: KnownIds = { alive: new Set(), deleted: new Set() };
  const valid = [...new Set(ids)].filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (valid.length === 0) return known;
  const found = await PresenterDocument.find(
    { _id: { $in: valid.map((id) => new mongoose.Types.ObjectId(id)) }, presenterId },
    { _id: 1, isDeleted: 1 },
  ).lean<{ _id: mongoose.Types.ObjectId; isDeleted?: boolean }[]>();
  for (const doc of found) {
    (doc.isDeleted === true ? known.deleted : known.alive).add(String(doc._id));
  }
  return known;
};

const DUPLICATE_KEY = 11000;

const applyEntity = async (
  entity: PresenterEntity,
  nodes: SyncNodeInput[],
  ctx: LwwContext,
  writtenThisBatch: Map<string, boolean>,
): Promise<{ results: NodeResult[]; countDelta: number }> => {
  const spec = ENTITIES[entity];
  const results: NodeResult[] = [];
  const presenterId = ctx.presenterId as mongoose.Types.ObjectId;

  /*
   * What is already stored for these ids. Decides insert-vs-update (A6, A7),
   * and gives the "alive before" half of the counter measurement.
   */
  const stored = await spec.model
    .find({ _id: { $in: nodes.map((node) => node._id) }, presenterId }, { _id: 1, isDeleted: 1 })
    .lean<{ _id: string; isDeleted?: boolean }[]>();
  const storedById = new Map(stored.map((row) => [String(row._id), row.isDeleted === true]));

  // ── parent checks ──────────────────────────────────────────────────────
  const parents = new Map<PresenterEntity, KnownIds>();
  for (const rule of spec.parents) {
    const wanted = nodes
      .map((node) => node[rule.field])
      .filter((value): value is string => typeof value === "string");
    parents.set(rule.entity, await collectKnownIds(rule.entity, wanted, presenterId, writtenThisBatch));
  }
  const documents = spec.documentField
    ? await collectKnownDocuments(
        nodes
          .map((node) => node[spec.documentField!])
          .filter((value): value is string => typeof value === "string"),
        presenterId,
      )
    : null;

  const accepted: SyncNodeInput[] = [];
  for (const node of nodes) {
    const isTombstone = node.isDeleted === true;
    const exists = storedById.has(node._id);

    /*
     * A6 — a delete for a row the server never had. There is nothing to
     * delete, and upserting it created a row holding nothing but `isDeleted`:
     * no card, no document, no text. Every other client then received it in
     * its pull, and the web's response schema rejects a link or passage with
     * no `cardId` — one such row stalled every web reader in the case.
     */
    if (isTombstone && !exists) {
      results.push({ id: node._id, entity, status: "applied" });
      continue;
    }

    // Tombstones are never refused: they are the tail of a cascade, and
    // dropping one would strand the delete on whichever device sent it.
    if (isTombstone) {
      accepted.push(node);
      continue;
    }

    let rejection: string | null = null;

    // A7 — a new row must arrive whole.
    if (!exists) {
      for (const field of spec.requiredOnInsert) {
        if (node[field] === undefined || node[field] === null) {
          rejection = `MISSING_${field.toUpperCase()}`;
          break;
        }
      }
    }

    // A7 — parents must exist, and must be alive.
    if (!rejection) {
      for (const rule of spec.parents) {
        const value = node[rule.field];
        if (value === null || value === undefined) {
          // Absent on an update means "unchanged", not "cleared".
          if (!rule.nullable && !exists) rejection = `MISSING_${rule.field.toUpperCase()}`;
          continue;
        }
        const known = parents.get(rule.entity);
        if (typeof value !== "string" || !known) rejection = "PARENT_MISSING";
        else if (known.deleted.has(value)) rejection = "PARENT_DELETED";
        else if (!known.alive.has(value)) rejection = "PARENT_MISSING";
        if (rejection) break;
      }
    }

    // A7 — anchored into a document that is still in the case.
    if (!rejection && spec.documentField && documents) {
      const documentId = node[spec.documentField];
      if (typeof documentId === "string") {
        if (documents.deleted.has(documentId)) rejection = "PARENT_DELETED";
        else if (!documents.alive.has(documentId)) rejection = "PARENT_MISSING";
      }
    }

    if (rejection) results.push({ id: node._id, entity, status: "rejected", reason: rejection });
    else accepted.push(node);
  }

  if (accepted.length === 0) return { results, countDelta: 0 };

  /**
   * Counters are measured, never inferred: live rows among this batch before
   * the write and after it, and the tile moves by the difference — right for
   * creates, deletes, re-sends and stale writes alike.
   */
  const aliveBefore = accepted.filter(
    (node) => storedById.has(node._id) && storedById.get(node._id) === false,
  ).length;

  // ── write ──────────────────────────────────────────────────────────────
  const ops = accepted.map((node) =>
    buildLwwOp(node, ctx, spec.mutableFields, spec.objectIdFields, spec.insertDefaults),
  );
  let retryIndexes: number[] = [];
  try {
    // `ordered: false` — one malformed node must not abandon the other 999.
    await spec.model.bulkWrite(ops as never[], { ordered: false });
  } catch (error: any) {
    if (!error?.writeErrors) throw error;
    const writeErrors: Array<{ index: number; code: number }> = Array.isArray(error.writeErrors)
      ? error.writeErrors
      : [error.writeErrors];
    retryIndexes = writeErrors
      .filter((entry) => entry.code === DUPLICATE_KEY)
      .map((entry) => entry.index);
    console.warn(
      `[presenter] sync bulkWrite reported ${writeErrors.length} write error(s) on ${entity}`,
    );
  }

  /*
   * One more try, in order, for rows that hit a unique index. An unordered
   * bulk may run a new passage's insert before the same batch's tombstone for
   * the passage it replaces; by now that tombstone has landed.
   */
  if (retryIndexes.length > 0) {
    try {
      await spec.model.bulkWrite(retryIndexes.map((index) => ops[index]) as never[], {
        ordered: true,
      });
    } catch (error: any) {
      if (!error?.writeErrors) throw error;
    }
  }

  const resolved = await resolveStatuses(spec.model, entity, accepted, ctx);

  /*
   * B3 — still a duplicate: another device attached a different passage to
   * the same reference first. Report it as a lost race with the row that won,
   * not as an unexplained write failure.
   */
  if (entity === "connections") {
    for (const result of resolved.results) {
      if (result.status !== "rejected" || result.reason !== "WRITE_FAILED") continue;
      const node = accepted.find((entry) => entry._id === result.id);
      if (!node || typeof node.cardId !== "string" || typeof node.linkId !== "string") continue;
      const winner = await spec.model
        .findOne({ presenterId, cardId: node.cardId, linkId: node.linkId, isDeleted: false }, { __v: 0 })
        .lean<Record<string, unknown>>();
      if (winner) {
        result.status = "stale";
        result.reason = "DUPLICATE_PASSAGE";
        result.server = winner;
      }
    }
  }

  for (const id of resolved.appliedIds) {
    const node = accepted.find((entry) => entry._id === id);
    writtenThisBatch.set(id, node?.isDeleted === true);
  }
  return {
    results: [...results, ...resolved.results],
    countDelta: spec.countsInto ? resolved.aliveAfter - aliveBefore : 0,
  };
};

type Row = { _id?: unknown; serverSeq?: number; [key: string]: unknown };

/**
 * A4 — a private highlight is its author's alone.
 *
 * Everyone else receives it as a tombstone rather than not at all: a
 * highlight that was shared and then made private has to be REMOVED from the
 * devices that already hold it, and silence would leave it there. The
 * tombstone keeps the anchor fields every client's schema requires, but not
 * the text.
 */
export const maskPrivateHighlight = (row: Row, viewerId: string): Row => {
  if (row.visibility !== "private" || String(row.createdBy) === viewerId) return row;
  return { ...row, isDeleted: true, text: "" };
};

/**
 * Everything in this case touched since the cursor — tombstones included,
 * which is why nothing here filters on `isDeleted`.
 *
 * Ordered and paged by `serverSeq`. The returned `cursor` is the sequence of
 * the last row actually delivered, never the time the batch happened to run.
 *
 * **A pull never splits a sequence.** All the rows a single write stamped
 * share one `serverSeq`, so when the page limit lands inside one, the whole
 * of that sequence is fetched and delivered, however large it is. This used
 * to overshoot only as far as the rows it had already read (3,000), so a
 * document delete cascading into more rows than that lost the rest for ever.
 */
const pullSince = async (
  presenterId: mongoose.Types.ObjectId,
  since: number | null,
  upTo: number,
  viewerId: string,
): Promise<{
  pull: Record<string, unknown[]>;
  documents: unknown[];
  hasMore: boolean;
  cursor: number;
}> => {
  /**
   * `null` means "everything". Rows written before the sequence change have
   * no `serverSeq` field at all (the old write path never set one, and a
   * pipeline upsert applies no schema default), and a missing field matches
   * no range — so a full pull names them explicitly. A delta does not need
   * to: any change to such a row stamps it with a sequence.
   */
  const window =
    since === null
      ? { $or: [{ serverSeq: { $lte: upTo } }, { serverSeq: null }] }
      : { serverSeq: { $gt: since, $lte: upTo } };
  const pull: Record<string, unknown[]> = {};
  let total = 0;
  let hasMore = false;
  // The highest sequence every collection has been drained to. Starts at the
  // ceiling and is pulled down by whichever collection had to truncate.
  let cursor = upTo;

  const drain = async (model: { find: Function }): Promise<Row[]> => {
    const rows = (await model
      .find({ presenterId, ...window })
      // By sequence alone, so the `{presenterId, serverSeq}` index serves the sort.
      .sort({ serverSeq: 1 })
      .limit(MAX_PULL_NODES + 1)
      .lean()) as Row[];

    if (rows.length <= MAX_PULL_NODES) return rows;

    // Truncate on a sequence boundary: everything below the last sequence on
    // the page, then that sequence whole.
    const lastSeq = rows[MAX_PULL_NODES - 1]?.serverSeq ?? 0;
    const below = rows.filter((row) => (row.serverSeq ?? 0) < lastSeq);
    const whole = (await model
      .find({ presenterId, serverSeq: lastSeq === 0 ? { $in: [0, null] } : lastSeq })
      .lean()) as Row[];

    hasMore = true;
    if (lastSeq < cursor) cursor = lastSeq;
    return [...below, ...whole];
  };

  for (const entity of ENTITY_ORDER) {
    let rows = await drain(ENTITIES[entity].model as unknown as { find: Function });
    if (entity === "highlights") rows = rows.map((row) => maskPrivateHighlight(row, viewerId));
    pull[entity] = rows;
    total += rows.length;
  }

  const documents = await drain(PresenterDocument as unknown as { find: Function });

  /**
   * Trim to the cursor we are actually going to return: if one collection
   * truncated, the others may hold rows past that point, and they will come
   * again on the next pull.
   */
  if (cursor < upTo) {
    for (const entity of ENTITY_ORDER) {
      pull[entity] = (pull[entity] as Row[]).filter((row) => (row.serverSeq ?? 0) <= cursor);
    }
  }
  const trimmedDocuments = (cursor < upTo
    ? documents.filter((row) => (row.serverSeq ?? 0) <= cursor)
    : documents
  ).map((row) => ({
    ...row,
    // B5 — the parse state as it actually is, as bootstrap already reports
    // it. Raw, a parse whose process died read as `running` for ever.
    parse: row.parse ? presentParse(row.parse as never) : row.parse,
  }));

  console.debug(
    `[presenter] pull returned ${total + trimmedDocuments.length} row(s) up to seq ${cursor}` +
      (hasMore ? " (more waiting)" : ""),
  );
  return { pull, documents: trimmedDocuments, hasMore, cursor };
};

export const runSync = async (
  request: SyncRequest,
  ctx: { firmId: string; userId: string },
): Promise<SyncResponse> => {
  const presenterId = new mongoose.Types.ObjectId(request.presenterId);
  const firmId = new mongoose.Types.ObjectId(ctx.firmId);
  const userId = new mongoose.Types.ObjectId(ctx.userId);

  const nodeCount = countNodes(request.changes);
  if (nodeCount > MAX_BATCH_NODES) throw new BatchTooLargeError(MAX_BATCH_NODES);

  const serverNow = Date.now();
  /**
   * The device's clock offset, measured once for the whole batch. Only the
   * offset is taken from the device; the intervals between its own edits are
   * preserved exactly. An unreadable `deviceNow` counts as "no skew" — NaN
   * would stamp every node in the batch with the same instant.
   */
  const measuredSkew = request.deviceNow ? serverNow - new Date(request.deviceNow).getTime() : 0;
  const skewMs = Number.isFinite(measuredSkew) ? measuredSkew : 0;

  const cursorIn = parseCursor(request.since);
  const since = cursorIn.value;

  const results: NodeResult[] = [];
  const countDeltas: Partial<Record<"documentCount" | "excerptCount", number>> = {};

  if (nodeCount > 0) {
    /**
     * Allocated before anything is written, and leased until the writes are
     * done: until it is released, no reader's ceiling passes this sequence, so
     * nobody can pull half of this batch and step over the rest (A1).
     */
    const batchSeq = await allocateSeq(presenterId);
    try {
      const lwwCtx: LwwContext = { firmId, presenterId, userId, serverSeq: batchSeq, skewMs, serverNow };
      // id → written as a tombstone?
      const writtenThisBatch = new Map<string, boolean>();

      for (const entity of ENTITY_ORDER) {
        const nodes = request.changes?.[entity];
        if (!nodes || nodes.length === 0) continue;
        const applied = await applyEntity(entity, nodes, lwwCtx, writtenThisBatch);
        results.push(...applied.results);

        const field = ENTITIES[entity].countsInto;
        if (field && applied.countDelta !== 0) {
          countDeltas[field] = (countDeltas[field] ?? 0) + applied.countDelta;
        }
      }
    } finally {
      await releaseSeq(presenterId, batchSeq);
    }
    // One write for the whole batch, not one per node.
    await bumpPresenterCounts(presenterId, countDeltas);
  }

  /**
   * The ceiling is read AFTER this batch released its lease: the highest
   * sequence whose rows are all written — ours included, unless someone
   * else's earlier batch is still in flight, in which case ours arrives on the
   * next pull instead of being skipped for ever.
   */
  const { visible, row: caseRow } = await readVisibleSeq<{ fullResyncRequiredBefore?: number }>(
    presenterId,
    { fullResyncRequiredBefore: 1 },
  );

  /**
   * The cursor is checked AFTER the writes, never before: a device away past
   * the retention window must still be able to upload the work it did while
   * away. The 409 carries `results`, so the device can commit what landed.
   */
  if (cursorIn.legacy) throw new CursorExpiredError(results);
  if (since !== null && isCursorExpired(since, caseRow?.fullResyncRequiredBefore ?? 0)) {
    throw new CursorExpiredError(results);
  }

  const pulled = await pullSince(presenterId, since, visible, ctx.userId);
  // Never hand back a cursor lower than the one the device sent.
  const cursor = since !== null && pulled.cursor < since ? since : pulled.cursor;

  return {
    serverTime: new Date().toISOString(),
    cursor: String(cursor),
    results,
    pull: pulled.pull,
    documents: pulled.documents,
    hasMore: pulled.hasMore,
  };
};
