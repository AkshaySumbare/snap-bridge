import { Request, Response, NextFunction, RequestHandler } from "express";
import mongoose from "mongoose";

import PresenterDocument from "../models/presenter/presenterDocument.model.js";
import * as presenterService from "../services/presenter/presenter.service.js";
import { bootstrapPresenter } from "../services/presenter/bootstrap.service.js";
import { PresenterGoneError } from "../services/presenter/seq.js";
import {
  BatchTooLargeError,
  CursorExpiredError,
  InvalidCursorError,
  MAX_BATCH_NODES,
  runSync,
} from "../services/presenter/sync.service.js";
import { buildOfflineManifest, DEFAULT_MANIFEST_EXPIRY_MINUTES } from "../services/presenter/manifest.service.js";
import {
  addDocument,
  getPages,
  listDocuments,
  softDeleteDocument,
  updateDocument,
} from "../services/presenter/document.service.js";
import { buildDownloadUrls, DEFAULT_EXPIRY_MINUTES } from "../services/presenter/sas.service.js";
import { searchPresenter } from "../services/presenter/search.service.js";
import * as inviteService from "../services/presenter/invite.service.js";
import {
  createPresenterSchema,
  inviteSchema,
  sharePresenterSchema,
  syncRequestSchema,
  updatePresenterSchema,
  updateDocumentSchema,
} from "../schemas/presenter/sync.schema.js";
import {
  parseDocumentNow,
  resetParse,
} from "../services/presenter/parse/parseWorker.js";
import { effectiveParseStatus, presentParse } from "../services/presenter/parse/parseStatus.js";
import type { PresenterScopedRequest } from "../middleware/presenterScope.js";
import type { AuthedRequest } from "../middleware/auth.js";

const actor = (req: Request) => {
  const auth = (req as AuthedRequest).auth;
  return {
    userId: new mongoose.Types.ObjectId(String(auth.userId)),
    firmId: new mongoose.Types.ObjectId(String(auth.userId)),
  };
};

export const looksLikePdf = (buffer: Buffer | undefined): boolean =>
  Boolean(buffer) && buffer!.subarray(0, 1024).includes("%PDF-");

const ok = (res: Response, data: unknown, status = 200) =>
  res.status(status).json({ success: true, data });

const fail = (res: Response, status: number, code: string, message?: string, extra?: unknown) =>
  res.status(status).json({ success: false, error: { code, message, ...(extra ?? {}) } });

export const asyncHandler =
  (handler: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

/** The reader's Presenter cases — the landing screen. */
export const listPresenters: RequestHandler = async (req: Request, res: Response) => {
  const { firmId, userId } = actor(req);
  ok(res, await presenterService.listPresenters(firmId, userId));
};

export const createPresenter: RequestHandler = async (req: Request, res: Response) => {
  const parsed = createPresenterSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, "INVALID_PAYLOAD", undefined, { issues: parsed.error.issues });
  }
  const { firmId, userId } = actor(req);
  ok(
    res,
    await presenterService.createPresenter(firmId, userId, parsed.data),
    201,
  );
};

export const patchPresenter: RequestHandler = async (req: PresenterScopedRequest, res: Response) => {
  const parsed = updatePresenterSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, "INVALID_PAYLOAD", undefined, { issues: parsed.error.issues });
  }
  const updated = await presenterService.updatePresenter(req.presenterId!, req.userObjectId!, parsed.data);
  if (!updated) return fail(res, 404, "PRESENTER_NOT_FOUND");
  ok(res, updated);
};

/**
 * Delete a case and everything in it — PDFs, parse bundles, pages,
 * annotations, the folder. Permanent; owner only.
 */
export const removePresenter: RequestHandler = async (req: PresenterScopedRequest, res: Response) => {
  ok(res, await presenterService.purgePresenter(req.presenterId!));
};

/** Replace the list of colleagues who can open this case. Owner only. */
export const sharePresenter: RequestHandler = async (req: PresenterScopedRequest, res: Response) => {
  const parsed = sharePresenterSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, "INVALID_PAYLOAD", undefined, { issues: parsed.error.issues });
  }
  const updated = await presenterService.setSharedWith(
    req.presenterId!,
    req.userObjectId!,
    parsed.data.userIds.map((id) => new mongoose.Types.ObjectId(id)),
  );
  if (!updated) return fail(res, 404, "PRESENTER_NOT_FOUND");
  ok(res, updated);
};

/** Remove one colleague. Owner only. */
export const unsharePresenter: RequestHandler = async (req: PresenterScopedRequest, res: Response) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
    return fail(res, 400, "INVALID_USER_ID");
  }
  const updated = await presenterService.revokeShare(
    req.presenterId!,
    req.userObjectId!,
    new mongoose.Types.ObjectId(req.params.userId),
  );
  if (!updated) return fail(res, 404, "PRESENTER_NOT_FOUND");
  ok(res, updated);
};

/** Everything needed to open a case. */
export const bootstrap: RequestHandler = async (req: PresenterScopedRequest, res: Response) => {
  ok(res, await bootstrapPresenter(req.presenterId!, req.userObjectId!));
};

/** Push and pull in one round trip — the only write path for annotation data. */
export const sync: RequestHandler = async (req: PresenterScopedRequest, res: Response) => {
  const parsed = syncRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, "INVALID_PAYLOAD", "Sync payload failed validation", {
      issues: parsed.error.issues.slice(0, 20),
    });
  }

  try {
    const result = await runSync(
      {
        presenterId: String(req.presenterId),
        deviceId: parsed.data.deviceId,
        deviceNow: parsed.data.deviceNow,
        since: parsed.data.since === null || parsed.data.since === undefined
          ? null
          : String(parsed.data.since),
        changes: parsed.data.changes as never,
      },
      { firmId: String(req.firmObjectId ?? actor(req).firmId), userId: String(req.userObjectId ?? actor(req).userId) },
    );
    return ok(res, result);
  } catch (error: any) {
    if (error instanceof CursorExpiredError) {
      /**
       * The device has been away longer than tombstones live, so a delta can no
       * longer describe the truth — it has to start over.
       *
       * `results` is carried because the batch was applied before the cursor
       * was refused: the device can commit what landed and drop it from its
       * outbox rather than replaying it after the resync.
       */
      return fail(res, 409, "CURSOR_EXPIRED", "Full resync required", {
        results: error.results,
      });
    }
    if (error instanceof InvalidCursorError) {
      return fail(res, 400, "INVALID_CURSOR", "Cursor must be a non-negative sequence");
    }
    if (error instanceof BatchTooLargeError) {
      return fail(res, 413, "BATCH_TOO_LARGE", "Split the batch and retry", {
        maxNodes: MAX_BATCH_NODES,
      });
    }
    throw error;
  }
};

/** Pull-only delta, for a device with nothing to push. */
export const pull: RequestHandler = async (req: PresenterScopedRequest, res: Response) => {
  const since = req.query.since ? String(req.query.since) : null;
  try {
    const result = await runSync(
      { presenterId: String(req.presenterId), since, changes: {} },
      { firmId: String(req.firmObjectId ?? actor(req).firmId), userId: String(req.userObjectId ?? actor(req).userId) },
    );
    return ok(res, result);
  } catch (error: any) {
    if (error instanceof CursorExpiredError) {
      return fail(res, 409, "CURSOR_EXPIRED", "Full resync required");
    }
    if (error instanceof InvalidCursorError) {
      return fail(res, 400, "INVALID_CURSOR", "Cursor must be a non-negative sequence");
    }
    throw error;
  }
};

// ── documents ───────────────────────────────────────────────────────────────

export const listPresenterDocuments: RequestHandler = async (req: PresenterScopedRequest, res: Response) => {
  ok(res, await listDocuments(req.presenterId!));
};

/**
 * Upload a PDF into this case.
 *
 * Returns as soon as the file is stored and the row exists — extraction is
 * kicked off in the background, because a bundle takes seconds to parse and
 * holding the request open for it would stall everything else this service is
 * serving.
 */
export const uploadDocument: RequestHandler = async (req: PresenterScopedRequest, res: Response) => {
  const file = (req as unknown as { file?: Express.Multer.File }).file;
  if (!file) return fail(res, 400, "NO_FILE", "Attach a PDF as `file`");
  if (!/pdf$/i.test(file.mimetype) && !/\.pdf$/i.test(file.originalname)) {
    return fail(res, 415, "UNSUPPORTED_TYPE", "Only PDF files are supported");
  }
  /*
   * B10 — and it has to actually be one. The type and the name are whatever
   * the client says; the bytes are not. A PDF carries `%PDF-` in its first
   * kilobyte (the spec allows leading junk before it).
   */
  if (!looksLikePdf(file.buffer)) {
    return fail(res, 415, "UNSUPPORTED_TYPE", "The file is not a PDF");
  }

  const created = await addDocument(
    req.presenterId!,
    req.firmObjectId!,
    req.userObjectId!,
    file,
    (req.body?.folderId as string) ?? null,
  );

  /**
   * Extraction starts now, off the request thread. The reader gets their
   * document row immediately and the rail shows "Parsing…" while it runs.
   * Concurrency is capped inside `parseDocumentNow`, so dropping twenty files
   * in at once queues them rather than starting twenty extractions.
   */
  setImmediate(() => {
    void parseDocumentNow(new mongoose.Types.ObjectId(String((created as { _id: unknown })._id)));
  });

  ok(res, created, 201);
};

export const patchDocument: RequestHandler = async (req: PresenterScopedRequest, res: Response) => {
  const parsed = updateDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, "INVALID_PAYLOAD", undefined, { issues: parsed.error.issues });
  }
  const updated = await updateDocument(
    new mongoose.Types.ObjectId(req.params.documentId),
    req.presenterId!,
    req.userObjectId!,
    parsed.data,
  );
  if (!updated) return fail(res, 404, "DOCUMENT_NOT_FOUND");
  ok(res, updated);
};

/**
 * Remove a document from the case.
 *
 * A tombstone, not a purge: the row, its pages, its file and every annotation
 * anchored into it stay put. Gone from the reader's view, still on record.
 */
export const removeDocument: RequestHandler = async (req: PresenterScopedRequest, res: Response) => {
  const removed = await softDeleteDocument(
    new mongoose.Types.ObjectId(req.params.documentId),
    req.presenterId!,
    req.userObjectId!,
  );
  if (!removed) return fail(res, 404, "DOCUMENT_NOT_FOUND");
  ok(res, removed);
};

/**
 * A range of parsed pages.
 *
 * Ranged rather than whole: the web reader wants the twenty pages around the
 * viewport, and mobile takes the bundle blob instead of paging through here.
 */
export const documentPages: RequestHandler = async (req: PresenterScopedRequest, res: Response) => {
  const documentId = new mongoose.Types.ObjectId(req.params.documentId);
  // B7 — a removed document's text is not served, even though its pages are kept.
  const document = await PresenterDocument.findOne({
    _id: documentId,
    presenterId: req.presenterId,
    isDeleted: false,
  }).lean();
  if (!document) return fail(res, 404, "DOCUMENT_NOT_FOUND");
  const parse = presentParse(document.parse);
  if (parse.status !== "ready") {
    return fail(res, 409, "PARSE_NOT_READY", `Document parse is ${parse.status}`, {
      status: parse.status,
      canRetry: parse.canRetry,
      error: document.parse.error,
    });
  }

  const from = Math.max(1, Number(req.query.from ?? 1));
  const to = Math.min(
    document.parse.pageCount || from,
    Number(req.query.to ?? from + 24),
  );
  ok(res, {
    documentId: String(documentId),
    parseVersion: document.parse.version,
    pageCount: document.parse.pageCount,
    from,
    to,
    pages: await getPages(documentId, document.parse.version, from, to),
  });
};

export const parseStatus: RequestHandler = async (req: PresenterScopedRequest, res: Response) => {
  const document = await PresenterDocument.findOne(
    { _id: new mongoose.Types.ObjectId(req.params.documentId), presenterId: req.presenterId },
    { parse: 1, title: 1, ocrComplete: 1 },
  ).lean();
  if (!document) return fail(res, 404, "DOCUMENT_NOT_FOUND");
  ok(res, { id: String(document._id), title: document.title, ...presentParse(document.parse) });
};

/**
 * Retry a parse the reader can see has gone wrong.
 *
 * This replaces the background sweeper: rather than silently retrying a dead
 * parse three times while the rail shows a spinner, the failure is surfaced
 * and the reader decides. It doubles as the way to re-run a document after a
 * parser upgrade.
 */
export const retryParse: RequestHandler = async (req: PresenterScopedRequest, res: Response) => {
  const documentId = new mongoose.Types.ObjectId(req.params.documentId);

  /**
   * Parse-once: a document that has finished can never be parsed again.
   *
   * Every highlight in the case is stored as `(paragraphId, start, end)`, and
   * paragraph ids come out of the extractor. Re-running it renumbers them
   * underneath annotations that already exist — the same id then means
   * different text, and a passage the advocate marked is quietly attributed to
   * a sentence they never read. There is nothing to gain either: extraction is
   * deterministic, so a second run on the same bytes produces the same output.
   *
   * Only a parse that produced nothing usable may be retried.
   */
  const document = await PresenterDocument.findOne(
    { _id: documentId, presenterId: req.presenterId },
    { parse: 1 },
  ).lean();
  if (!document) return fail(res, 404, "DOCUMENT_NOT_FOUND");

  const status = effectiveParseStatus(document.parse);
  if (status === "ready") {
    return fail(res, 409, "PARSE_ALREADY_READY", "This document is already parsed");
  }
  if (status === "running") {
    return fail(res, 409, "PARSE_IN_PROGRESS", "This document is already being parsed");
  }

  const reset = await resetParse(documentId, req.presenterId!);
  if (!reset) return fail(res, 404, "DOCUMENT_NOT_FOUND");

  const outcome = await parseDocumentNow(documentId);
  if (outcome === "busy") {
    return fail(res, 409, "PARSE_IN_PROGRESS", "This document is already being parsed");
  }
  ok(res, { id: String(documentId), status: "pending", started: outcome === "started" });
};

// ── offline download ────────────────────────────────────────────────────────

export const downloadUrls: RequestHandler = async (req: PresenterScopedRequest, res: Response) => {
  const documentIds = req.query.documentIds
    ? String(req.query.documentIds).split(",").filter(Boolean)
    : null;
  const invalid = documentIds?.find((id) => !mongoose.Types.ObjectId.isValid(id));
  if (invalid) return fail(res, 400, "INVALID_DOCUMENT_ID", invalid);

  const expiryMinutes = Number(req.query.expiryMinutes ?? DEFAULT_EXPIRY_MINUTES);
  ok(
    res,
    await buildDownloadUrls(req.presenterId!, documentIds, expiryMinutes, {
      userId: String(req.userObjectId ?? actor(req).userId),
    }),
  );
};

/**
 * Everything a device needs in order to take this case to court.
 *
 * One call: the file list, the total size, a checksum per file and short-lived
 * URLs pointing straight at storage.
 */
export const offlineManifest: RequestHandler = async (req: PresenterScopedRequest, res: Response) => {
  const expiryMinutes = Number(req.query.expiryMinutes ?? DEFAULT_MANIFEST_EXPIRY_MINUTES);
  ok(
    res,
    await buildOfflineManifest(
      req.presenterId!,
      Number.isFinite(expiryMinutes) ? expiryMinutes : DEFAULT_MANIFEST_EXPIRY_MINUTES,
      { userId: String(req.userObjectId ?? actor(req).userId) },
    ),
  );
};

// ── search ──────────────────────────────────────────────────────────────────

export const search: RequestHandler = async (req: PresenterScopedRequest, res: Response) => {
  const query = String(req.query.q ?? "");
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  ok(res, { query, hits: await searchPresenter(req.presenterId!, query, limit) });
};

export const searchUsers: RequestHandler = async (req: Request, res: Response) => {
  const { userId } = actor(req);
  ok(res, await inviteService.searchUsers(String(req.query.q ?? ""), userId));
};

export const listCollaborators: RequestHandler = async (req: PresenterScopedRequest, res: Response) => {
  ok(res, await inviteService.listCollaborators(req.presenterId!));
};

export const inviteCollaborator: RequestHandler = async (req: PresenterScopedRequest, res: Response) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, "INVALID_PAYLOAD", undefined, { issues: parsed.error.issues });
  }
  ok(res, await inviteService.inviteByEmail(req.presenterId!, req.userObjectId!, parsed.data.email), 201);
};

export const acceptInvite: RequestHandler = async (req: Request, res: Response) => {
  try {
    const result = await inviteService.acceptInvite(String(req.params.token), actor(req).userId);
    if (!result) return fail(res, 404, "INVITE_NOT_FOUND");
    ok(res, result);
  } catch (error) {
    if (error instanceof Error && error.message === "INVITE_EMAIL_MISMATCH") {
      return fail(res, 403, "INVITE_EMAIL_MISMATCH", "Sign in with the invited email to accept");
    }
    throw error;
  }
};

// ── errors ──────────────────────────────────────────────────────────────────

export const presenterErrorHandler = (
  error: any,
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (res.headersSent) return next(error);
  // The case was purged while this request was writing into it.
  if (error instanceof PresenterGoneError) {
    res.status(410).json({ success: false, error: { code: "PRESENTER_DELETED" } });
    return;
  }
  console.error("[presenter] unhandled error", error);
  res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  });
};
