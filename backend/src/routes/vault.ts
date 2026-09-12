import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import {
  askSchema,
  createFolderSchema,
  listDocumentsSchema,
  moveDocumentSchema,
  uploadConfirmSchema,
  uploadSignSchema,
} from "../validators/vault.validator.js";
import * as uploadService from "../services/vault/upload.service.js";
import * as documentService from "../services/vault/document.service.js";
import * as folderService from "../services/vault/folder.service.js";
import * as semanticSearchService from "../services/vault/semantic-search.service.js";
import { enqueueDocumentProcessing } from "../queues/document.queue.js";
import { toPublicVaultDocument } from "../models/vault/Document.js";

const router = Router();

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

router.use(requireAuth);

router.post(
  "/upload/sign",
  asyncHandler(async (req, res) => {
    const parsed = uploadSignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { auth } = req as AuthedRequest;
    await folderService.ensureSystemFolders(auth.userId);

    const params = uploadService.getUploadSignature(
      auth.userId,
      parsed.data.mimeType,
      parsed.data.fileName,
    );
    res.json(params);
  }),
);

router.post(
  "/upload/confirm",
  asyncHandler(async (req, res) => {
    const parsed = uploadConfirmSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { auth } = req as AuthedRequest;
    await uploadService.verifyVaultUpload(parsed.data.publicId, parsed.data.resourceType);

    const title =
      parsed.data.title ??
      parsed.data.publicId.split("/").pop()?.replace(/\.[^.]+$/, "") ??
      "Untitled document";

    const doc = await documentService.createDocumentRecord(auth.userId, {
      title,
      mimeType: parsed.data.mimeType,
      cloudinaryPublicId: parsed.data.publicId,
      secureUrl: parsed.data.secureUrl,
      resourceType: parsed.data.resourceType,
      format: parsed.data.format,
      bytes: parsed.data.bytes,
      folderId: parsed.data.folderId,
    });

    await enqueueDocumentProcessing(doc._id.toString());

    res.status(201).json({
      document: toPublicVaultDocument(doc),
      message: "Upload confirmed. Document is being processed.",
    });
  }),
);

router.get(
  "/documents",
  asyncHandler(async (req, res) => {
    const parsed = listDocumentsSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { auth } = req as AuthedRequest;
    const result = await documentService.listDocuments(auth.userId, parsed.data);
    res.json(result);
  }),
);

router.post(
  "/documents/retry-failed",
  asyncHandler(async (req, res) => {
    const { auth } = req as AuthedRequest;
    const result = await documentService.retryAllFailedDocuments(auth.userId);
    res.json({
      ...result,
      message: `Retried ${result.retried.length} of ${result.total} failed document(s).`,
    });
  }),
);

router.get(
  "/documents/:id",
  asyncHandler(async (req, res) => {
    const { auth } = req as AuthedRequest;
    const document = await documentService.getDocument(auth.userId, paramId(req.params.id));
    res.json({ document });
  }),
);

router.patch(
  "/documents/:id/move",
  asyncHandler(async (req, res) => {
    const parsed = moveDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { auth } = req as AuthedRequest;
    const document = await documentService.moveDocument(
      auth.userId,
      paramId(req.params.id),
      parsed.data.folderId,
    );
    res.json({ document, message: "Document moved" });
  }),
);

router.delete(
  "/documents/:id",
  asyncHandler(async (req, res) => {
    const { auth } = req as AuthedRequest;
    await documentService.deleteDocument(auth.userId, paramId(req.params.id));
    res.json({ message: "Document deleted" });
  }),
);

router.post(
  "/documents/:id/retry",
  asyncHandler(async (req, res) => {
    const { auth } = req as AuthedRequest;
    const document = await documentService.retryDocumentProcessing(
      auth.userId,
      paramId(req.params.id),
    );
    res.json({
      document,
      message: "Document re-queued for processing. Check status until it becomes ready.",
    });
  }),
);

router.post(
  "/ask",
  asyncHandler(async (req, res) => {
    const parsed = askSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { auth } = req as AuthedRequest;
    const result = await semanticSearchService.askVault(auth.userId, parsed.data.query, {
      folderId: parsed.data.folderId,
      documentId: parsed.data.documentId,
      limit: parsed.data.limit,
      generateAnswer: parsed.data.generateAnswer ?? true,
    });
    res.json(result);
  }),
);

router.get(
  "/folders",
  asyncHandler(async (req, res) => {
    const { auth } = req as AuthedRequest;
    const folders = await folderService.listFolders(auth.userId);
    res.json({ folders });
  }),
);

router.post(
  "/folders",
  asyncHandler(async (req, res) => {
    const parsed = createFolderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { auth } = req as AuthedRequest;
    const folder = await folderService.createFolder(
      auth.userId,
      parsed.data.name,
      parsed.data.parentId,
    );
    res.status(201).json({ folder, message: "Folder created" });
  }),
);

router.delete(
  "/folders/:id",
  asyncHandler(async (req, res) => {
    const { auth } = req as AuthedRequest;
    await folderService.deleteFolder(auth.userId, paramId(req.params.id));
    res.json({ message: "Folder deleted" });
  }),
);

export default router;
