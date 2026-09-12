import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";
import type { DocumentSourceType } from "./Document.js";

export interface IDocumentChunk {
  userId: Types.ObjectId;
  documentId: Types.ObjectId;
  folderId?: Types.ObjectId;
  chunkIndex: number;
  text: string;
  embedding: number[];
  pageNumber?: number;
  sourceType: DocumentSourceType;
}

export interface IDocumentChunkDocument extends IDocumentChunk, Document {
  createdAt: Date;
  updatedAt: Date;
}

const documentChunkSchema = new Schema<IDocumentChunkDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    documentId: { type: Schema.Types.ObjectId, ref: "VaultDocument", required: true, index: true },
    folderId: { type: Schema.Types.ObjectId, ref: "Folder", index: true },
    chunkIndex: { type: Number, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number], required: true },
    pageNumber: { type: Number },
    sourceType: {
      type: String,
      enum: ["pdf", "docx", "image", "screenshot"],
      required: true,
    },
  },
  { timestamps: true },
);

documentChunkSchema.index({ documentId: 1, chunkIndex: 1 }, { unique: true });

export const DocumentChunk: Model<IDocumentChunkDocument> =
  mongoose.models.DocumentChunk ??
  mongoose.model<IDocumentChunkDocument>("DocumentChunk", documentChunkSchema);
