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

    const format = uploadService.deriveFileFormat(
      parsed.data.publicId,
      parsed.data.mimeType,
      parsed.data.format,
    );

    const title =
      parsed.data.title ??
      parsed.data.publicId.split("/").pop()?.replace(/\.[^.]+$/, "") ??
      "Untitled document";

    const result = await documentService.confirmVaultUpload(auth.userId, {
      title,
      mimeType: parsed.data.mimeType,
      cloudinaryPublicId: parsed.data.publicId,
      secureUrl: parsed.data.secureUrl,
      resourceType: parsed.data.resourceType,
      format,
      bytes: parsed.data.bytes,
      folderId: parsed.data.folderId,
    });

    const message = result.created
      ? "Upload confirmed. Document is being processed."
      : "Document already exists — re-queued for processing.";

    res.status(result.created ? 201 : 200).json({
      document: toPublicVaultDocument(result.document),
      message,
      requeued: result.requeued,
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

router.post(
  "/ask/stream",
  asyncHandler(async (req, res) => {
    const parsed = askSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { auth } = req as AuthedRequest;
    const generateAnswer = parsed.data.generateAnswer ?? true;
    let aborted = false;
    req.on("close", () => {
      aborted = true;
    });

    const writeEvent = (payload: Record<string, unknown>) => {
      if (aborted) return;
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    try {
      const results = await semanticSearchService.searchVault(auth.userId, parsed.data.query, {
        folderId: parsed.data.folderId,
        documentId: parsed.data.documentId,
        limit: parsed.data.limit,
      });

      writeEvent({ type: "sources", query: parsed.data.query, results });

      if (aborted) {
        res.end();
        return;
      }

      let answer: string | null = null;
      if (generateAnswer && results.length > 0) {
        answer = await semanticSearchService.streamAnswer(
          parsed.data.query,
          results,
          (chunk) => writeEvent({ type: "delta", content: chunk }),
          () => aborted,
        );
      } else if (generateAnswer && results.length === 0) {
        answer =
          "I couldn't find anything relevant in your documents for that question.";
        writeEvent({ type: "delta", content: answer });
      }

      writeEvent({ type: "done", answer });
      res.end();
    } catch (err) {
      if (aborted) {
        res.end();
        return;
      }

      const message =
        err instanceof Error ? err.message : "Failed to generate answer";
      writeEvent({ type: "error", message });
      res.end();
    }
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
