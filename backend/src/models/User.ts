import mongoose, { Schema, type Document, type Model } from "mongoose";

export type AuthProvider = "local" | "google";

export interface IUser {
  email: string;
  passwordHash?: string;
  name?: string;
  googleId?: string;
  authProvider: AuthProvider;
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
    createdAt: user.createdAt,
  };
}
