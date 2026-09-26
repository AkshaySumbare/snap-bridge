import mongoose, { Schema, Model, Document } from "mongoose";

/**
 * A Presenter case: the folder a reader opens on the landing screen.
 *
 * Deliberately Presenter's own, and NOT the platform's case-management case.
 * The two answer different questions — a managed case is a matter with
 * parties, hearings, a team and an RBAC surface; a Presenter case is "these
 * PDFs, and the argument I am building against them". Binding them would mean
 * a reader could not open a bundle without someone first creating a matter and
 * assigning them a seat on it, which is the opposite of the flow this feature
 * is for: land here, add a PDF, start reading.
 *
 * Scoped by firm, then by owner or share list. Nothing here consults
 * `case_team_assignments` or `defaultAdvocateRBAC`.
 */

export interface IPresenter extends Document {
  _id: mongoose.Types.ObjectId;
  firmId: mongoose.Types.ObjectId;
  name: string;
  client: string;
  /** Tint for the folder tile. */
  accent: string;
  /**
   * What the folder tile shows. Maintained on write rather than counted on
   * read: the landing screen is the most-visited page in the feature, and
   * counting every highlight in every case to render two small numbers gets
   * slower with every annotation anyone ever makes.
   *
   * Drift is possible in principle — a process dying between a write and its
   * `$inc` — so `recountPresenter()` exists to put them right.
   */
  documentCount: number;
  excerptCount: number;
  /**
   * The case's sync sequence — the cursor every device stores.
   *
   * Incremented once per sync batch and stamped onto every row that batch
   * writes. See `services/presenter/seq.ts` for why this replaced a timestamp.
   */
  seq: number;
  /**
   * Sequences allocated but not yet fully written, with when they were taken.
   * Readers never pull past the lowest of these — see `services/presenter/seq.ts`.
   */
  seqPending: { seq: number; at: Date }[];
  createdBy: mongoose.Types.ObjectId;
  /**
   * Colleagues let into this case. A flat list, not a permission matrix —
   * everyone in it works the file the same way as the owner. Only the owner
   * can change the list or delete the case.
   */
  sharedWith: mongoose.Types.ObjectId[];
  /**
   * People who were let in and later removed. Only so a device of theirs can
   * be told "your access was removed" (403) instead of "no such case" (404) —
   * a stranger guessing ids still learns nothing.
   */
  formerMembers: mongoose.Types.ObjectId[];
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  lastModifiedAt: Date;
  serverUpdatedAt: Date;
  isDeleted: boolean;
  deletedAt: Date | null;
  version: number;
}

const presenterSchema = new Schema<IPresenter>(
  {
    firmId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true, maxlength: 300 },
    client: { type: String, default: "", trim: true, maxlength: 300 },
    accent: {
      type: String,
      enum: ["red", "green", "blue", "yellow", "magenta", "cyan"],
      default: "blue",
    },
    documentCount: { type: Number, default: 0, min: 0 },
    excerptCount: { type: Number, default: 0, min: 0 },
    seq: { type: Number, default: 0, min: 0 },
    seqPending: {
      type: [{ _id: false, seq: { type: Number, required: true }, at: { type: Date, required: true } }],
      default: [],
    },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    sharedWith: { type: [Schema.Types.ObjectId], default: [] },
    formerMembers: { type: [Schema.Types.ObjectId], default: [] },
    updatedBy: { type: Schema.Types.ObjectId },
    createdAt: { type: Date, default: () => new Date() },
    lastModifiedAt: { type: Date, default: () => new Date() },
    serverUpdatedAt: { type: Date, default: () => new Date() },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    version: { type: Number, default: 1 },
  },
  { timestamps: false, versionKey: false, collection: "presenters" },
);

/** The landing screen: cases I own… */
presenterSchema.index({ firmId: 1, createdBy: 1, isDeleted: 1, lastModifiedAt: -1 });
/** …and cases shared with me. Two indexes because the `$or` uses both arms. */
presenterSchema.index({ firmId: 1, sharedWith: 1, isDeleted: 1, lastModifiedAt: -1 });

const Presenter: Model<IPresenter> =
  (mongoose.models.Presenter as Model<IPresenter>) ??
  mongoose.model<IPresenter>("Presenter", presenterSchema);

export default Presenter;
