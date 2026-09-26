import mongoose, { Model } from "mongoose";

/**
 * Last-Write-Wins over `bulkWrite`.
 *
 * Every write in Presenter — a highlight made on the web, five hundred edits
 * queued on a plane — arrives here. The rule is the same for all of them: the
 * edit with the later `lastModifiedAt` wins, and equal timestamps break by
 * version, then by nothing at all (the stored value stays, so the outcome is
 * stable no matter which order the packets arrived in).
 *
 * It is expressed as an aggregation-pipeline update with `upsert: true`, one
 * op per node, for two reasons:
 *
 *   - it is a single atomic operation, so there is no read-then-write window
 *     for a concurrent sync to slip through;
 *   - the obvious alternative — `filter: { lastModifiedAt: { $lt: incoming } }`
 *     with `upsert: true` — creates a DUPLICATE whenever the filter misses,
 *     because an upsert that matches nothing inserts. Filtering on `_id` alone
 *     and deciding inside the pipeline avoids that entirely.
 */

export interface SyncNodeInput {
  _id: string;
  lastModifiedAt: string | Date;
  isDeleted?: boolean;
  version?: number;
  [key: string]: unknown;
}

export interface LwwContext {
  firmId: unknown;
  presenterId: unknown;
  userId: unknown;
  /** The sequence this batch was allocated. Stamped onto every row it writes. */
  serverSeq: number;
  /**
   * `serverNow - deviceNow`, in milliseconds, for the device that sent this
   * batch. Added to every incoming `lastModifiedAt` — see `correctClientTime`.
   */
  skewMs?: number;
  /**
   * The batch's own "now", fixed once when the batch is received.
   *
   * It has to be fixed rather than read per call: `correctClientTime` clamps to
   * it, so a write and the read-back that checks whether that write won must
   * clamp against the same instant. Reading `Date.now()` in both places would
   * make any clamped timestamp differ by the milliseconds between them, and
   * every such node would be reported `stale` immediately after being applied.
   */
  serverNow: number;
}

/**
 * How far back a corrected timestamp may sit.
 *
 * Wide enough for any genuine offline session, narrow enough that a device
 * reporting 1970 cannot lose every conflict it will ever have.
 */
const MAX_BACKDATE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The client's edit time, made comparable to everyone else's.
 *
 * LWW asks "which edit did the user make later?", so the timestamp has to come
 * from the device — the server only learns about an offline edit hours after it
 * happened. But taking the device's clock at face value means a tablet running
 * a day fast wins every conflict for a day, and one running slow has its court
 * work quietly overwritten by edits made before it.
 *
 * The fix is to trust the device's *intervals* and not its *offset*: the batch
 * reports what time it thinks it is, we compare that with our own clock, and
 * shift every timestamp in the batch by the difference. Relative order within
 * the batch is preserved exactly; the batch as a whole lands where it belongs
 * against everyone else's work.
 *
 * A device that sends no `deviceNow` gets `skew = 0`, which is the behaviour
 * that existed before this.
 */
export const correctClientTime = (
  raw: string | Date | number,
  skewMs = 0,
  serverNow = Date.now(),
): Date => {
  const shifted = new Date(raw).getTime() + skewMs;
  if (Number.isNaN(shifted)) return new Date(serverNow);
  // Never in the future: an edit cannot have been made after we received it.
  // Never absurdly old: that is a broken clock, not a year-old annotation.
  return new Date(Math.min(Math.max(shifted, serverNow - MAX_BACKDATE_MS), serverNow));
};

export type NodeStatus = "applied" | "stale" | "rejected";

export interface NodeResult {
  id: string;
  entity: string;
  status: NodeStatus;
  reason?: string;
  /** The winning state, returned when the incoming write lost. */
  server?: Record<string, unknown>;
}

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/**
 * Cast a client-supplied id back to an ObjectId.
 *
 * A pipeline update writes exactly what it is given: no schema, no casting.
 * So this has to happen here, or `documentId` lands as a string next to a
 * `presenterId` that is an ObjectId, and every later query picks one type and
 * silently misses the other.
 */
const toObjectId = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(toObjectId);
  if (typeof value === "string" && OBJECT_ID.test(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return value;
};

/** `$$NOW` in a pipeline update — server time, never the client's. */
const SERVER_NOW = "$$NOW";

const WINS = "$__wins";

export const buildLwwOp = (
  node: SyncNodeInput,
  ctx: LwwContext,
  mutableFields: readonly string[],
  objectIdFields: readonly string[] = [],
  insertDefaults: Readonly<Record<string, unknown>> = {},
) => {
  const incoming = correctClientTime(node.lastModifiedAt, ctx.skewMs, ctx.serverNow);
  const incomingVersion = typeof node.version === "number" ? node.version : 0;

  const fieldUpdates: Record<string, unknown> = {};
  for (const field of mutableFields) {
    /**
     * A field the client did not send is left exactly as it is.
     *
     * This is what makes a tombstone safe. A delete arrives as little more
     * than `{ _id, lastModifiedAt, isDeleted: true }`, and treating those
     * absent fields as nulls would wipe the card's own text on the way out —
     * so an undelete would restore an empty card, and the tombstone in
     * everyone else's pull would carry nothing to show for it.
     *
     * An explicit `null` still clears: that is a value, not an omission.
     * Creates and edits send full state, which is why this cannot be used to
     * sneak a partial update past conflict resolution.
     */
    if (!Object.prototype.hasOwnProperty.call(node, field)) continue;
    const value = objectIdFields.includes(field) ? toObjectId(node[field]) : node[field];
    /**
     * `$literal`, always. This is an aggregation-pipeline update, and in a
     * pipeline a string that starts with `$` is a field path, `$$` a variable.
     * Unwrapped, a note reading "$500 penalty" was stored as a missing field
     * (and still reported `applied`), and "$$" text failed the write outright.
     * Client data is data; it must never be evaluated.
     */
    fieldUpdates[field] = { $cond: [WINS, { $literal: value }, `$${field}`] };
  }

  /*
   * The model's defaults, for a field nobody sent and nothing stored. A
   * pipeline upsert never applies Mongoose defaults, so a new row used to be
   * missing every field its creator left out. `$ifNull` makes this a no-op
   * on any row that already has a value.
   */
  for (const [field, fallback] of Object.entries(insertDefaults)) {
    if (field in fieldUpdates) continue;
    fieldUpdates[field] = { $ifNull: [`$${field}`, { $literal: fallback }] };
  }

  return {
    updateOne: {
      filter: { _id: node._id, firmId: ctx.firmId, presenterId: ctx.presenterId },
      update: [
        {
          $set: {
            __wins: {
              $or: [
                // Nothing stored yet: this is the node's first arrival.
                { $eq: [{ $type: "$lastModifiedAt" }, "missing"] },
                { $gt: [incoming, "$lastModifiedAt"] },
                {
                  $and: [
                    { $eq: [incoming, "$lastModifiedAt"] },
                    { $gt: [incomingVersion, { $ifNull: ["$version", 0] }] },
                  ],
                },
              ],
            },
          },
        },
        {
          $set: {
            ...fieldUpdates,
            isDeleted: { $cond: [WINS, node.isDeleted === true, { $ifNull: ["$isDeleted", false] }] },
            deletedAt: {
              $cond: [
                WINS,
                node.isDeleted === true ? incoming : null,
                { $ifNull: ["$deletedAt", null] },
              ],
            },
            lastModifiedAt: { $cond: [WINS, incoming, "$lastModifiedAt"] },
            version: {
              $cond: [WINS, { $add: [{ $ifNull: ["$version", 0] }, 1] }, "$version"],
            },
            updatedBy: { $cond: [WINS, ctx.userId, "$updatedBy"] },
            /**
             * Always advances, even when the incoming write LOSES.
             *
             * Counter-intuitive, and load-bearing: the device that lost has to
             * see this node in its next pull to correct itself. If the cursor
             * did not move, a stale device would stay stale forever.
             */
            serverUpdatedAt: SERVER_NOW,
            /**
             * Advances with `serverUpdatedAt`, and for the same reason: a
             * device whose write lost has to see this row in its next pull to
             * correct itself.
             */
            serverSeq: ctx.serverSeq,
            firmId: ctx.firmId,
            presenterId: ctx.presenterId,
            createdBy: { $ifNull: ["$createdBy", ctx.userId] },
            createdAt: { $ifNull: ["$createdAt", SERVER_NOW] },
            schemaVersion: { $ifNull: ["$schemaVersion", 1] },
          },
        },
        { $unset: "__wins" },
      ],
      upsert: true,
    },
  };
};

/**
 * Did each write actually win?
 *
 * `bulkWrite` reports how many documents it touched, not which version
 * survived, so the stored state is read back and compared. The same read
 * produces the `server` payload a losing device needs in order to correct
 * itself — so this costs one query per entity, not one per node, and saves the
 * client a second round trip.
 */
export const resolveStatuses = async <T>(
  model: Model<T>,
  entity: string,
  nodes: SyncNodeInput[],
  ctx: LwwContext,
): Promise<{ results: NodeResult[]; appliedIds: string[]; aliveAfter: number }> => {
  const ids = nodes.map((node) => node._id);
  const stored = await model
    .find({ _id: { $in: ids }, presenterId: ctx.presenterId }, { __v: 0 })
    .lean<Record<string, any>[]>();
  const byId = new Map(stored.map((doc) => [String(doc._id), doc]));

  const results: NodeResult[] = [];
  const appliedIds: string[] = [];
  // How many of these nodes are alive now the writes have landed. Counted
  // from the rows themselves rather than inferred from what was sent, so a
  // re-sent create or a delete that lost on timestamp cannot skew it.
  const aliveAfter = stored.filter((doc) => doc.isDeleted !== true).length;

  for (const node of nodes) {
    const current = byId.get(node._id);
    if (!current) {
      results.push({ id: node._id, entity, status: "rejected", reason: "WRITE_FAILED" });
      continue;
    }
    // Compared against the corrected time, because that is what was written.
    const incoming = correctClientTime(node.lastModifiedAt, ctx.skewMs, ctx.serverNow).getTime();
    const won = new Date(current.lastModifiedAt).getTime() === incoming;
    if (won) {
      appliedIds.push(node._id);
      results.push({ id: node._id, entity, status: "applied" });
    } else {
      results.push({ id: node._id, entity, status: "stale", server: current });
    }
  }

  return { results, appliedIds, aliveAfter };
};
