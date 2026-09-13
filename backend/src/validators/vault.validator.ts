import { z } from "zod";
import { VAULT_ALLOWED_MIME_TYPES } from "../config/vault.js";

const mimeTypeSchema = z.enum(VAULT_ALLOWED_MIME_TYPES as unknown as [string, ...string[]]);

export const uploadSignSchema = z.object({
  mimeType: mimeTypeSchema,
  fileName: z.string().trim().min(1).max(200).optional(),
});

export const uploadConfirmSchema = z.object({
  publicId: z.string().min(1).max(500),
  secureUrl: z.string().url(),
  mimeType: mimeTypeSchema,
  /** Optional — Cloudinary raw/PDF uploads often omit format; server derives from file name */
  format: z.string().min(1).max(20).optional(),
  bytes: z.number().int().positive(),
  resourceType: z.enum(["image", "raw", "video", "auto"]),
  title: z.string().trim().min(1).max(200).optional(),
  folderId: z.string().min(1).optional(),
});

export const askSchema = z.object({
  query: z.string().trim().min(2).max(2000),
  folderId: z.string().min(1).optional(),
  documentId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(20).optional(),
  generateAnswer: z.boolean().optional(),
});

export const createFolderSchema = z.object({
  name: z.string().trim().min(1).max(80),
  parentId: z.string().min(1).optional(),
});

export const moveDocumentSchema = z.object({
  folderId: z.string().min(1),
});

export const listDocumentsSchema = z.object({
  folderId: z.string().min(1).optional(),
  status: z.enum(["processing", "ready", "failed"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
