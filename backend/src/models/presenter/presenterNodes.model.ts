import mongoose, { Schema, Model } from "mongoose";
import {
  applySyncIndexes,
  syncNodeFields,
  syncSchemaOptions,
  type SyncNodeFields,
} from "./common.js";

/**
 * The six syncable Presenter collections.
 *
 * Declared in one file because they share a field set and a sync engine, but
 * each is its own collection: its own indexes, its own validation, its own
 * growth curve. Highlights outnumber Points by four orders of magnitude in a
 * real matter, and they should not share a b-tree.
 *
 * There is no "workspace" above Points. It existed to let one case hold
 * several separate boards, which nothing ever asked for — every card and Point
 * scopes to the case directly, which is one collection, one index and one
 * parent check per sync batch cheaper.
 *
 * Note what is NOT here: `x`, `y`, `width`, `collapsed`. Canvas layout is not
 * server state. Pixel coordinates from a 1400px desktop canvas mean nothing on
 * a phone, and storing them would force mobile either to honour a layout it
 * cannot render or to sync fields it never reads. A single `order` integer
 * carries the only thing that has to survive — which argument comes first —
 * and it means the same thing on both platforms.
 */

export const HIGHLIGHT_COLORS = [
  "red",
  "green",
  "blue",
  "yellow",
  "magenta",
  "cyan",
  "clear",
] as const;

// ── wrappers (Points) ───────────────────────────────────────────────────────

export interface IPresenterWrapper extends SyncNodeFields {
  title: string;
  order: number;
}

const wrapperSchema = new Schema<IPresenterWrapper>(
  {
    ...syncNodeFields(),
    title: { type: String, required: true, trim: true, maxlength: 500, default: "" },
    order: { type: Number, required: true, default: 0 },
  },
  { ...syncSchemaOptions, collection: "presenter_wrappers" },
);
applySyncIndexes(wrapperSchema);
wrapperSchema.index({ presenterId: 1, order: 1 });

// ── cards (arguments and excerpts) ──────────────────────────────────────────

export interface IPresenterCard extends SyncNodeFields {
  kind: "note" | "excerpt";
  wrapperId: string | null;
  order: number;
  title: string;
  text: string;
  color: string;
  placement: "margin" | "canvas";
  /** Excerpts, and notes born from a highlight, cite where they came from. */
  documentId: mongoose.Types.ObjectId | null;
  pageNumber: number | null;
  highlightId: string | null;
}

const cardSchema = new Schema<IPresenterCard>(
  {
    ...syncNodeFields(),
    kind: { type: String, required: true, enum: ["note", "excerpt"] },
    wrapperId: { type: String, default: null },
    order: { type: Number, required: true, default: 0 },
    title: { type: String, default: "", maxlength: 1000 },
    text: { type: String, default: "", maxlength: 20000 },
    color: { type: String, enum: HIGHLIGHT_COLORS, default: "clear" },
    placement: { type: String, enum: ["margin", "canvas"], default: "canvas" },
    documentId: { type: Schema.Types.ObjectId, default: null },
    pageNumber: { type: Number, default: null },
    highlightId: { type: String, default: null },
  },
  { ...syncSchemaOptions, collection: "presenter_cards" },
);
applySyncIndexes(cardSchema);
cardSchema.index({ presenterId: 1, wrapperId: 1, order: 1 });

// ── links (references — "ref to 1") ─────────────────────────────────────────

export interface IPresenterLink extends SyncNodeFields {
  cardId: string;
  label: string;
  documentIds: mongoose.Types.ObjectId[];
  order: number;
}

const linkSchema = new Schema<IPresenterLink>(
  {
    ...syncNodeFields(),
    cardId: { type: String, required: true },
    label: { type: String, default: "", maxlength: 500 },
    documentIds: { type: [Schema.Types.ObjectId], default: [] },
    order: { type: Number, required: true, default: 0 },
  },
  { ...syncSchemaOptions, collection: "presenter_links" },
);
applySyncIndexes(linkSchema);
linkSchema.index({ presenterId: 1, cardId: 1, order: 1 });

// ── connections (the passage a reference points at) ─────────────────────────

export interface IPresenterConnection extends SyncNodeFields {
  cardId: string;
  linkId: string | null;
  documentId: mongoose.Types.ObjectId;
  pageNumber: number;
  paragraphId: string;
  parseVersion: number;
  ratioX: number;
  ratioY: number;
}

const connectionSchema = new Schema<IPresenterConnection>(
  {
    ...syncNodeFields(),
    cardId: { type: String, required: true },
    linkId: { type: String, default: null },
    documentId: { type: Schema.Types.ObjectId, required: true },
    pageNumber: { type: Number, required: true, min: 1 },
    paragraphId: { type: String, required: true },
    // Which parse the anchor was measured against. Re-parsing a document
    // writes a new version rather than moving paragraphs under existing
    // anchors, so this is what tells us an anchor has been left behind.
    parseVersion: { type: Number, required: true, default: 1 },
    ratioX: { type: Number, required: true, min: 0, max: 1 },
    ratioY: { type: Number, required: true, min: 0, max: 1 },
  },
  { ...syncSchemaOptions, collection: "presenter_connections" },
);
applySyncIndexes(connectionSchema);
connectionSchema.index({ presenterId: 1, cardId: 1 });
connectionSchema.index({ presenterId: 1, documentId: 1, paragraphId: 1 });
/**
 * One passage per reference — the rule the UI enforces, enforced here too so
 * a buggy or replayed client cannot leave a reference pointing two ways.
 * Partial, because tombstones and unfiled connections are exempt.
 */
connectionSchema.index(
  { cardId: 1, linkId: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false, linkId: { $type: "string" } },
  },
);

// ── highlights ──────────────────────────────────────────────────────────────

export interface IPresenterHighlight extends SyncNodeFields {
  documentId: mongoose.Types.ObjectId;
  pageNumber: number;
  paragraphId: string;
  parseVersion: number;
  start: number;
  end: number;
  color: string;
  text: string;
  visibility: "shared" | "private";
}

const highlightSchema = new Schema<IPresenterHighlight>(
  {
    ...syncNodeFields(),
    documentId: { type: Schema.Types.ObjectId, required: true },
    pageNumber: { type: Number, required: true, min: 1 },
    paragraphId: { type: String, required: true },
    parseVersion: { type: Number, required: true, default: 1 },
    // Character offsets into the paragraph's text; `end` is exclusive.
    start: { type: Number, required: true, min: 0 },
    end: { type: Number, required: true, min: 0 },
    color: { type: String, enum: HIGHLIGHT_COLORS, required: true },
    // Denormalised so excerpt cards and search need no paragraph lookup.
    text: { type: String, default: "", maxlength: 5000 },
    visibility: { type: String, enum: ["shared", "private"], default: "shared" },
  },
  { ...syncSchemaOptions, collection: "presenter_highlights" },
);
applySyncIndexes(highlightSchema);
highlightSchema.index({ presenterId: 1, documentId: 1, pageNumber: 1, isDeleted: 1 });

// ── registration ────────────────────────────────────────────────────────────

const model = <T>(name: string, schema: Schema<any>): Model<T> =>
  (mongoose.models[name] as Model<T>) ?? mongoose.model<T>(name, schema);

export const PresenterWrapper = model<IPresenterWrapper>("PresenterWrapper", wrapperSchema);
export const PresenterCard = model<IPresenterCard>("PresenterCard", cardSchema);
export const PresenterLink = model<IPresenterLink>("PresenterLink", linkSchema);
export const PresenterConnection = model<IPresenterConnection>(
  "PresenterConnection",
  connectionSchema,
);
export const PresenterHighlight = model<IPresenterHighlight>(
  "PresenterHighlight",
  highlightSchema,
);
