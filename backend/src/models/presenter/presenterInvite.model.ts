import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export type PresenterInviteStatus = "pending" | "accepted" | "revoked";

export interface IPresenterInvite extends Document {
  presenterId: Types.ObjectId;
  email: string;
  token: string;
  invitedBy: Types.ObjectId;
  status: PresenterInviteStatus;
  acceptedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const presenterInviteSchema = new Schema<IPresenterInvite>(
  {
    presenterId: { type: Schema.Types.ObjectId, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    token: { type: String, required: true, unique: true, index: true },
    invitedBy: { type: Schema.Types.ObjectId, required: true },
    status: { type: String, enum: ["pending", "accepted", "revoked"], default: "pending" },
    acceptedBy: { type: Schema.Types.ObjectId },
  },
  { timestamps: true, collection: "presenter_invites" },
);

presenterInviteSchema.index({ presenterId: 1, email: 1, status: 1 });
/** One pending invite per email per presenter. */
presenterInviteSchema.index(
  { presenterId: 1, email: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);

export const PresenterInvite: Model<IPresenterInvite> =
  mongoose.models.PresenterInvite ??
  mongoose.model<IPresenterInvite>("PresenterInvite", presenterInviteSchema);
