import { Types } from "mongoose";
import { deleteAsset, type CloudinaryResourceType } from "../cloudinary.service.js";
import {
  VaultDocument,
  toPublicVaultDocument,
  type IVaultDocumentDoc,
} from "../../models/vault/Document.js";
import { DocumentChunk } from "../../models/vault/DocumentChunk.js";
import { chunkText } from "./chunking.service.js";
import { embedTexts, isEmbeddingConfigured } from "./embedding.service.js";
import { classifyDocumentText } from "./classification.service.js";
import {
  downloadFileBuffer,
  extractTextFromBuffer,
  resolveSourceType,
} from "./text-extraction.service.js";
import { getFolderById, getFolderBySmartCategory } from "./folder.service.js";
import {
  enqueueDocumentProcessing,
  isDocumentJobActive,
} from "../../queues/document.queue.js";
import { AppError } from "../../utils/errors.js";

export async function createDocumentRecord(
  userId: string,
  data: {
    title: string;
    mimeType: string;
    cloudinaryPublicId: string;
    secureUrl: string;
    resourceType: CloudinaryResourceType;
    format: string;
    bytes: number;
    folderId?: string;
  },
) {
  const sourceType = resolveSourceType(data.mimeType);

  let folderId: Types.ObjectId | undefined;
  if (data.folderId) {
    const folder = await getFolderById(userId, data.folderId);
    folderId = folder._id;
  }

  const doc = await VaultDocument.create({
    userId: new Types.ObjectId(userId),
    title: data.title,
    mimeType: data.mimeType,
    sourceType,
    folderId,
    cloudinaryPublicId: data.cloudinaryPublicId,
    secureUrl: data.secureUrl,
    resourceType: data.resourceType,
    format: data.format,
    bytes: data.bytes,
    status: "processing",
    chunkCount: 0,
    tags: [],
  });

  return doc;
}

export async function findDocumentByPublicId(userId: string, cloudinaryPublicId: string) {
  return VaultDocument.findOne({
    userId: new Types.ObjectId(userId),
    cloudinaryPublicId,
  });
}

/** Confirm upload: create new doc or return existing + re-queue if already uploaded. */
export async function confirmVaultUpload(
  userId: string,
  data: {
    title: string;
    mimeType: string;
    cloudinaryPublicId: string;
    secureUrl: string;
    resourceType: CloudinaryResourceType;
    format: string;
    bytes: number;
    folderId?: string;
  },
) {
  const existing = await findDocumentByPublicId(userId, data.cloudinaryPublicId);
  if (existing) {
    existing.secureUrl = data.secureUrl;
    existing.bytes = data.bytes;
    existing.format = data.format;
    if (existing.status !== "processing") {
      existing.status = "processing";
      existing.processingError = undefined;
      await existing.save();
      await enqueueDocumentProcessing(existing._id.toString(), { replaceExisting: true });
    }
    return { document: existing, created: false, requeued: true };
  }

  const doc = await createDocumentRecord(userId, data);
  await enqueueDocumentProcessing(doc._id.toString());
  return { document: doc, created: true, requeued: false };
}

export async function processDocument(documentId: string): Promise<void> {
  const doc = await VaultDocument.findById(documentId);
  if (!doc) return;

  try {
    const buffer = await downloadFileBuffer(doc.secureUrl);
    const { text, sourceType } = await extractTextFromBuffer(buffer, doc.mimeType);

    doc.sourceType = sourceType;
    doc.extractedText = text;

    if (!text) {
      doc.status = "ready";
      doc.chunkCount = 0;
      await doc.save();
      return;
    }

    if (!doc.folderId) {
      const category = classifyDocumentText(text, doc.title);
      const folder = await getFolderBySmartCategory(doc.userId.toString(), category);
      doc.folderId = folder._id;
    }

    if (!isEmbeddingConfigured()) {
      doc.status = "ready";
      doc.chunkCount = 0;
      doc.processingError = "Embeddings skipped: OPENAI_API_KEY not configured";
      await doc.save();
      return;
    }

    const chunks = chunkText(text);
    const embeddings = await embedTexts(chunks.map((c) => c.text));

    await DocumentChunk.deleteMany({ documentId: doc._id });

    await DocumentChunk.insertMany(
      chunks.map((chunk, index) => ({
        userId: doc.userId,
        documentId: doc._id,
        folderId: doc.folderId,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        embedding: embeddings[index],
        pageNumber: chunk.pageNumber,
        sourceType: doc.sourceType,
      })),
    );

    doc.status = "ready";
    doc.chunkCount = chunks.length;
    doc.processingError = undefined;
    await doc.save();
  } catch (err) {
    doc.status = "failed";
    doc.processingError = err instanceof Error ? err.message : "Processing failed";
    await doc.save();
    throw err;
  }
}

export async function listDocuments(
  userId: string,
  options?: { folderId?: string; status?: string; limit?: number; offset?: number },
) {
  const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
  if (options?.folderId) filter.folderId = new Types.ObjectId(options.folderId);
  if (options?.status) filter.status = options.status;

  const limit = Math.min(options?.limit ?? 50, 100);
  const offset = options?.offset ?? 0;

  const [documents, total] = await Promise.all([
    VaultDocument.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit),
    VaultDocument.countDocuments(filter),
  ]);

  return {
    documents: documents.map(toPublicVaultDocument),
    total,
    limit,
    offset,
  };
}

export async function getDocument(userId: string, documentId: string) {
  const doc = await VaultDocument.findOne({
    _id: new Types.ObjectId(documentId),
    userId: new Types.ObjectId(userId),
  });
  if (!doc) throw new AppError(404, "Document not found");
  return toPublicVaultDocument(doc);
}

export async function moveDocument(userId: string, documentId: string, folderId: string) {
  const doc = await VaultDocument.findOne({
    _id: new Types.ObjectId(documentId),
    userId: new Types.ObjectId(userId),
  });
  if (!doc) throw new AppError(404, "Document not found");

  const folder = await getFolderById(userId, folderId);
  doc.folderId = folder._id;
  await doc.save();

  await DocumentChunk.updateMany(
    { documentId: doc._id },
    { $set: { folderId: folder._id } },
  );

  return toPublicVaultDocument(doc);
}

export async function deleteDocument(userId: string, documentId: string) {
  const doc = await VaultDocument.findOne({
    _id: new Types.ObjectId(documentId),
    userId: new Types.ObjectId(userId),
  });
  if (!doc) throw new AppError(404, "Document not found");

  await DocumentChunk.deleteMany({ documentId: doc._id });
  await deleteAsset(
    doc.cloudinaryPublicId,
    doc.resourceType as CloudinaryResourceType,
  );
  await VaultDocument.deleteOne({ _id: doc._id });
}

export function getDocumentJobId(doc: IVaultDocumentDoc): string {
  return doc._id.toString();
}

/**
 * Re-queue document processing after a failure (e.g. OpenAI quota, network error).
 * Safe to call when status is `failed` or `ready` with missing embeddings.
 */
export async function retryDocumentProcessing(userId: string, documentId: string) {
  const doc = await VaultDocument.findOne({
    _id: new Types.ObjectId(documentId),
    userId: new Types.ObjectId(userId),
  });
  if (!doc) throw new AppError(404, "Document not found");

  if (doc.status === "processing") {
    const active = await isDocumentJobActive(documentId);
    if (active) {
      throw new AppError(409, "Document is already being processed. Wait a moment and check again.");
    }
  }

  doc.status = "processing";
  doc.processingError = undefined;
  await doc.save();

  try {
    await enqueueDocumentProcessing(documentId, { replaceExisting: true });
  } catch (err) {
    doc.status = "failed";
    doc.processingError = err instanceof Error ? err.message : "Failed to enqueue retry";
    await doc.save();
    throw new AppError(500, doc.processingError);
  }

  return toPublicVaultDocument(doc);
}

/** Retry failed docs and docs that finished without embeddings (e.g. API key was missing). */
export async function retryAllFailedDocuments(userId: string) {
  const failed = await VaultDocument.find({
    userId: new Types.ObjectId(userId),
    $or: [
      { status: "failed" },
      {
        status: "ready",
        chunkCount: 0,
        processingError: { $exists: true, $ne: null },
      },
    ],
  });

  const retried: string[] = [];
  const errors: { documentId: string; error: string }[] = [];

  for (const doc of failed) {
    try {
      await retryDocumentProcessing(userId, doc._id.toString());
      retried.push(doc._id.toString());
    } catch (err) {
      errors.push({
        documentId: doc._id.toString(),
        error: err instanceof Error ? err.message : "Retry failed",
      });
    }
  }

  return { retried, errors, total: failed.length };
}
