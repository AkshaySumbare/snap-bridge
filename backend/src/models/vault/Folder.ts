import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";
import type { SmartCategory } from "../../config/vault.js";

export type FolderType = "system" | "custom";

export interface IFolder {
  userId: Types.ObjectId;
  name: string;
  slug: string;
  type: FolderType;
  smartCategory?: SmartCategory;
  parentId?: Types.ObjectId;
  color?: string;
}

export interface IFolderDocument extends IFolder, Document {
  createdAt: Date;
  updatedAt: Date;
}

const folderSchema = new Schema<IFolderDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    type: { type: String, enum: ["system", "custom"], required: true },
    smartCategory: { type: String },
    parentId: { type: Schema.Types.ObjectId, ref: "Folder" },
    color: { type: String },
  },
  { timestamps: true },
);

folderSchema.index({ userId: 1, slug: 1 }, { unique: true });

export const Folder: Model<IFolderDocument> =
  mongoose.models.Folder ?? mongoose.model<IFolderDocument>("Folder", folderSchema);

export function toPublicFolder(folder: IFolderDocument) {
  return {
    id: folder._id.toString(),
    name: folder.name,
    slug: folder.slug,
    type: folder.type,
    smartCategory: folder.smartCategory ?? null,
    parentId: folder.parentId?.toString() ?? null,
    color: folder.color ?? null,
    createdAt: folder.createdAt,
  };
}
