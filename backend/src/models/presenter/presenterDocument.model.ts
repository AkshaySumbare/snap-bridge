import mongoose, { Schema, Model, Document } from "mongoose";

/**
 * A PDF a reader uploaded into a Presenter case.
 *
 * Presenter owns these files outright — they are uploaded here, stored in
 * Presenter's own container, and deleted with the case. Nothing is shared
 * with, or borrowed from, case-management.
 *
 * Kept out of the sync collections because a different writer owns most of it:
 * the parse worker updates `parse.*` on its own cadence, and mixing worker
 * output into the user-edit conflict path would mean a parse completing could
 * lose a rename.
 */

export type ParseStatus = "pending" | "running" | "ready" | "failed";

export interface IPresenterDocument extends Document {
  _id: mongoose.Types.ObjectId;
  firmId: mongoose.Types.ObjectId;
  presenterId: mongoose.Types.ObjectId;
  /** What the reader calls it — starts as the file name, renameable. */
  title: string;
  /** The name it was uploaded under, kept for the download filename. */
  originalFileName: string;
  mimeType: string;
  kind: "pdf" | "docx" | "webpage";
  folderId: string | null;
  order: number;
  visibleToCollaborators: boolean;
  ocrComplete: boolean;
  blob: {
    container: string;
    path: string;
    sizeBytes: number;
    checksumSha256: string | null;
    secureUrl?: string | null;
    publicId?: string | null;
  };
  parse: {
    status: ParseStatus;
    version: number;
    /** Total pages in the file, known as soon as it opens. */
    pageCount: number;
    /** Pages read so far. Equals `pageCount` once the parse is done. */
    pagesDone: number;
    paragraphCount: number;
    engine: string | null;
    /** Whole parse as one gzipped JSON blob, for offline bulk download. */
    bundleBlobPath: string | null;
    /** Gzipped size, so a device can show progress and check free space first. */
    bundleSizeBytes: number;
    /** Of the gzipped bytes — how a device verifies what it downloaded. */
    bundleSha256: string | null;
    error: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    attempts: number;
  };
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  lastModifiedAt: Date;
  serverUpdatedAt: Date;
  /** The sync cursor — documents travel in the same pull as the nodes. */
  serverSeq: number;
  isDeleted: boolean;
  deletedAt: Date | null;
  version: number;
}

const presenterDocumentSchema = new Schema<IPresenterDocument>(
  {
    firmId: { type: Schema.Types.ObjectId, required: true },
    presenterId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true, trim: true, maxlength: 500 },
    originalFileName: { type: String, required: true },
    mimeType: { type: String, default: "application/pdf" },
    kind: { type: String, enum: ["pdf", "docx", "webpage"], default: "pdf" },
    folderId: { type: String, default: null },
    order: { type: Number, default: 0 },
    visibleToCollaborators: { type: Boolean, default: true },
    ocrComplete: { type: Boolean, default: false },
    blob: {
      container: { type: String, required: true },
      path: { type: String, required: true },
      sizeBytes: { type: Number, default: 0 },
      checksumSha256: { type: String, default: null },
      secureUrl: { type: String, default: null },
      publicId: { type: String, default: null },
    },
    parse: {
      status: {
        type: String,
        enum: ["pending", "running", "ready", "failed"],
        default: "pending",
      },
      version: { type: Number, default: 1 },
      pageCount: { type: Number, default: 0 },
      pagesDone: { type: Number, default: 0 },
      paragraphCount: { type: Number, default: 0 },
      engine: { type: String, default: null },
      bundleBlobPath: { type: String, default: null },
      bundleSizeBytes: { type: Number, default: 0 },
      bundleSha256: { type: String, default: null },
      error: { type: String, default: null },
      startedAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
      attempts: { type: Number, default: 0 },
    },
    createdBy: { type: Schema.Types.ObjectId },
    updatedBy: { type: Schema.Types.ObjectId },
    createdAt: { type: Date, default: () => new Date() },
    lastModifiedAt: { type: Date, default: () => new Date() },
    serverUpdatedAt: { type: Date, default: () => new Date() },
    serverSeq: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    version: { type: Number, default: 1 },
  },
  { timestamps: false, versionKey: false, collection: "presenter_documents" },
);

presenterDocumentSchema.index({ firmId: 1, presenterId: 1, isDeleted: 1 });
presenterDocumentSchema.index({ presenterId: 1, folderId: 1, order: 1 });
presenterDocumentSchema.index({ presenterId: 1, serverSeq: 1 });
/** The parse worker's claim query. */
presenterDocumentSchema.index({ "parse.status": 1, "parse.startedAt": 1 });

const PresenterDocument: Model<IPresenterDocument> =
  (mongoose.models.PresenterDocument as Model<IPresenterDocument>) ??
  mongoose.model<IPresenterDocument>("PresenterDocument", presenterDocumentSchema);

export default PresenterDocument;
