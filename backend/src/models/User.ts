import mongoose, { Schema, type Document, type Model } from "mongoose";

export type AuthProvider = "local" | "google";

export type AvatarSource = "upload" | "google";

export interface IUser {
  email: string;
  passwordHash?: string;
  name?: string;
  googleId?: string;
  authProvider: AuthProvider;
  isVerified: boolean;
  avatarUrl?: string;
  avatarPublicId?: string;
  avatarSource?: AvatarSource;
}

export interface IUserDocument extends IUser, Document {
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String },
    name: { type: String, trim: true },
    googleId: { type: String, unique: true, sparse: true },
    authProvider: { type: String, enum: ["local", "google"], required: true },
    isVerified: { type: Boolean, default: false },
    avatarUrl: { type: String },
    avatarPublicId: { type: String },
    avatarSource: { type: String, enum: ["upload", "google"] },
  },
  { timestamps: true },
);

export const User: Model<IUserDocument> =
  mongoose.models.User ?? mongoose.model<IUserDocument>("User", userSchema);

export function toPublicUser(user: IUserDocument) {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name ?? null,
    authProvider: user.authProvider,
    isVerified: user.isVerified ?? user.authProvider === "google",
    avatarUrl: user.avatarUrl ?? null,
    createdAt: user.createdAt,
  };
}
