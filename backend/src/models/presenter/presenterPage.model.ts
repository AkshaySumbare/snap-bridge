import mongoose, { Schema, Model, Document } from "mongoose";

/**
 * One page of parsed text. Immutable.
 *
 * Per page rather than per document on purpose: a 600-page bundle in one
 * document would approach the 16MB cap and make every read enormous, where a
 * page is a few kilobytes and the reader can fetch exactly the range it is
 * showing.
 *
 * Never synced as a mutable node — this is server-owned output, cached by the
 * client against `(documentId, parseVersion)` and safe to keep forever,
 * because a re-parse writes a new version rather than editing this one.
 */

export interface IParagraphRun {
  /** Character range within the paragraph's text… */
  start: number;
  end: number;
  /** …and the rectangle it occupies, page-relative 0–1. */
  bbox: [number, number, number, number];
}

export interface IParsedParagraph {
  /** `{documentId}:v{parseVersion}:p{page}:i{index}` — deterministic. */
  id: string;
  text: string;
  label?: string;
  heading?: boolean;
  indent?: number;
  bbox: [number, number, number, number];
  /**
   * Char-range → rectangle, one per line.
   *
   * This is what lets a client draw a highlight on the *rendered PDF*. The web
   * reader works in extracted text, where a character range is enough; mobile
   * renders the real page, where a character range means nothing without
   * geometry. Deriving it twice would let the two disagree.
   */
  runs: IParagraphRun[];
}

export interface IPresenterPage extends Document {
  firmId: mongoose.Types.ObjectId;
  presenterId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  parseVersion: number;
  pageNumber: number;
  width: number;
  height: number;
  paragraphs: IParsedParagraph[];
  createdAt: Date;
  serverUpdatedAt: Date;
}

const runSchema = new Schema<IParagraphRun>(
  {
    start: { type: Number, required: true },
    end: { type: Number, required: true },
    bbox: { type: [Number], required: true },
  },
  { _id: false },
);

const paragraphSchema = new Schema<IParsedParagraph>(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    label: { type: String },
    heading: { type: Boolean },
    indent: { type: Number },
    bbox: { type: [Number], required: true },
    runs: { type: [runSchema], default: [] },
  },
  { _id: false },
);

const presenterPageSchema = new Schema<IPresenterPage>(
  {
    firmId: { type: Schema.Types.ObjectId, required: true },
    presenterId: { type: Schema.Types.ObjectId, required: true },
    documentId: { type: Schema.Types.ObjectId, required: true },
    parseVersion: { type: Number, required: true },
    pageNumber: { type: Number, required: true, min: 1 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    paragraphs: { type: [paragraphSchema], default: [] },
    createdAt: { type: Date, default: () => new Date() },
    serverUpdatedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false, versionKey: false, collection: "presenter_pages" },
);

presenterPageSchema.index(
  { documentId: 1, parseVersion: 1, pageNumber: 1 },
  { unique: true },
);
presenterPageSchema.index({ presenterId: 1, documentId: 1 });
/** Server-side search over the bundle's body text. */
presenterPageSchema.index({ "paragraphs.text": "text" });

const PresenterPage: Model<IPresenterPage> =
  (mongoose.models.PresenterPage as Model<IPresenterPage>) ??
  mongoose.model<IPresenterPage>("PresenterPage", presenterPageSchema);

export default PresenterPage;
