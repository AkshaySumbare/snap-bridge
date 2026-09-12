import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";
import type { VaultMimeType } from "../../config/vault.js";

export type DocumentStatus = "processing" | "ready" | "failed";
export type DocumentSourceType = "pdf" | "docx" | "image" | "screenshot";

export interface IVaultDocument {
  userId: Types.ObjectId;
  title: string;
  mimeType: VaultMimeType | string;
  sourceType: DocumentSourceType;
  folderId?: Types.ObjectId;
  cloudinaryPublicId: string;
  secureUrl: string;
  resourceType: "image" | "raw" | "video" | "auto";
  format: string;
  bytes: number;
  extractedText?: string;
  status: DocumentStatus;
  chunkCount: number;
  processingError?: string;
  tags: string[];
}

export interface IVaultDocumentDoc extends IVaultDocument, Document {
  createdAt: Date;
  updatedAt: Date;
}

const vaultDocumentSchema = new Schema<IVaultDocumentDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true },
    sourceType: {
      type: String,
      enum: ["pdf", "docx", "image", "screenshot"],
      required: true,
    },
    folderId: { type: Schema.Types.ObjectId, ref: "Folder", index: true },
    cloudinaryPublicId: { type: String, required: true },
    secureUrl: { type: String, required: true },
    resourceType: { type: String, required: true },
    format: { type: String, required: true },
    bytes: { type: Number, required: true },
    extractedText: { type: String },
    status: {
      type: String,
      enum: ["processing", "ready", "failed"],
      default: "processing",
      index: true,
    },
    chunkCount: { type: Number, default: 0 },
    processingError: { type: String },
    tags: { type: [String], default: [] },
  },
  { timestamps: true },
);

vaultDocumentSchema.index({ userId: 1, createdAt: -1 });
vaultDocumentSchema.index({ extractedText: "text" });

export const VaultDocument: Model<IVaultDocumentDoc> =
  mongoose.models.VaultDocument ??
  mongoose.model<IVaultDocumentDoc>("VaultDocument", vaultDocumentSchema);

export function toPublicVaultDocument(doc: IVaultDocumentDoc) {
  return {
    id: doc._id.toString(),
    title: doc.title,
    mimeType: doc.mimeType,
    sourceType: doc.sourceType,
    folderId: doc.folderId?.toString() ?? null,
    secureUrl: doc.secureUrl,
    format: doc.format,
    bytes: doc.bytes,
    status: doc.status,
    chunkCount: doc.chunkCount,
    processingError: doc.processingError ?? null,
    tags: doc.tags,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
