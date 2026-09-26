import { Schema, SchemaDefinition } from "mongoose";

/**
 * Fields every syncable Presenter node carries.
 *
 * Seven collections (folders, workspaces, wrappers, cards, links,
 * connections, highlights) share this shape. They stay separate collections —
 * separate indexes, separate validation, separate growth curves — but one
 * shared field set is what lets a single sync engine drive all of them.
 *
 * Two clocks, deliberately:
 *
 *   `lastModifiedAt`  the CLIENT's intent time. Drives Last-Write-Wins, because
 *                     the question "which edit did the user make later?" is
 *                     about the users, not about which packet reached us first.
 *   `serverUpdatedAt` OUR time. Drives the sync cursor. A device with a skewed
 *                     clock must never be able to hide its own writes from the
 *                     next pull, or to poison the cursor for anybody else.
 */

/** Ids are generated on the client so a node created offline keeps its identity. */
export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export interface SyncNodeFields {
  _id: string;
  firmId: Schema.Types.ObjectId;
  presenterId: Schema.Types.ObjectId;
  createdBy?: Schema.Types.ObjectId;
  updatedBy?: Schema.Types.ObjectId;
  createdAt: Date;
  lastModifiedAt: Date;
  serverUpdatedAt: Date;
  isDeleted: boolean;
  deletedAt: Date | null;
  version: number;
  schemaVersion: number;
  /** The sync cursor. Allocated per batch from `case.seq`. */
  serverSeq: number;
}

export const syncNodeFields = (): SchemaDefinition => ({
  _id: {
    type: String,
    required: true,
    // A client id we cannot recognise is a bug on the device, not something
    // to paper over with a server-generated one — that would silently create
    // a duplicate of whatever the device thinks it already saved.
    match: [ULID_PATTERN, "Node id must be a ULID"],
  },
  firmId: { type: Schema.Types.ObjectId, required: true },
  presenterId: { type: Schema.Types.ObjectId, required: true },
  createdBy: { type: Schema.Types.ObjectId },
  updatedBy: { type: Schema.Types.ObjectId },
  createdAt: { type: Date, required: true, default: () => new Date() },
  lastModifiedAt: { type: Date, required: true },
  serverUpdatedAt: { type: Date, required: true, default: () => new Date() },
  /**
   * What the delta pull actually orders and pages by.
   *
   * `serverUpdatedAt` is still written and still readable, but it cannot be a
   * cursor: it comes from a different clock than the pull query does, and a
   * truncated pull cannot express "I stopped here" in it. See `seq.ts`.
   */
  serverSeq: { type: Number, required: true, default: 0 },
  isDeleted: { type: Boolean, required: true, default: false },
  deletedAt: { type: Date, default: null },
  version: { type: Number, required: true, default: 1 },
  schemaVersion: { type: Number, required: true, default: 1 },
});

/**
 * Indexes every sync collection needs, whatever it holds.
 *
 *  1. open a case  — everything alive in one case
 *  2. delta pull   — everything touched since a cursor, tombstones included,
 *                    which is why it does NOT filter on isDeleted. Ordered by
 *                    `serverSeq`, the per-case counter, not by a timestamp.
 */
export const applySyncIndexes = (schema: Schema): void => {
  schema.index({ firmId: 1, presenterId: 1, isDeleted: 1 });
  schema.index({ presenterId: 1, serverSeq: 1 });
};

export const syncSchemaOptions = {
  timestamps: false as const,
  versionKey: false as const,
  // Ids arrive from the client; Mongoose must not mint an ObjectId over them.
  _id: false as const,
};
