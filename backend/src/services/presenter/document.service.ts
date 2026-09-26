import crypto from "crypto";
import mongoose from "mongoose";

import PresenterDocument from "../../models/presenter/presenterDocument.model.js";
import PresenterPage from "../../models/presenter/presenterPage.model.js";
import {
  PresenterCard,
  PresenterConnection,
  PresenterHighlight,
  PresenterLink,
} from "../../models/presenter/presenterNodes.model.js";
import { documentBlobPath, PRESENTER_CONTAINER, uploadBuffer } from "./blob.js";
import { effectiveParseStatus, presentParse } from "./parse/parseStatus.js";
import { bumpPresenterCounts } from "./presenter.service.js";
import { withSeq } from "./seq.js";

/**
 * Documents inside a Presenter case.
 *
 * The reader uploads a PDF here and Presenter owns it end to end: its own
 * container, its own row, its own parse. Nothing is imported from, or shared
 * with, case-management.
 */

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export const addDocument = async (
  presenterId: mongoose.Types.ObjectId,
  firmId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  file: UploadedFile,
  folderId: string | null,
) => {
  // The id is minted first so the blob path can be built from it: one document,
  // one folder in storage, and no chance of two uploads with the same file name
  // overwriting each other.
  const documentId = new mongoose.Types.ObjectId();
  const safeName = file.originalname.replace(/[^\w.\-() ]+/g, "_").slice(0, 200);
  const blobPath = documentBlobPath(String(presenterId), String(documentId), safeName);

  const stored = await uploadBuffer(blobPath, file.buffer, file.mimetype || "application/pdf");

  const order = await PresenterDocument.countDocuments({ presenterId, isDeleted: false });
  const now = new Date();
  const created = await withSeq(presenterId, (stamp) => PresenterDocument.create({
    _id: documentId,
    firmId,
    presenterId,
    title: safeName.replace(/\.pdf$/i, ""),
    originalFileName: safeName,
    mimeType: file.mimetype || "application/pdf",
    kind: "pdf",
    folderId,
    order,
    // The container is recorded per document, not just read from config at
    // download time: point PRESENTER_CONTAINER somewhere new and everything
    // already uploaded still resolves to where it actually lives.
    blob: {
      container: PRESENTER_CONTAINER,
      path: blobPath,
      publicId: stored.publicId,
      secureUrl: stored.secureUrl,
      sizeBytes: file.size,
      /**
       * Hashed here rather than at parse time: the buffer is already in memory,
       * and a device preparing a case offline needs the checksum to know
       * whether it already holds this file and to verify what it downloads.
       */
      checksumSha256: crypto.createHash("sha256").update(file.buffer).digest("hex"),
    },
    // Queued, not parsed. The row exists immediately so the rail can show it
    // as "Parsing…" while the worker does the slow part.
    parse: { status: "pending", version: 1, attempts: 0 },
    createdBy: userId,
    updatedBy: userId,
    createdAt: now,
    lastModifiedAt: now,
    ...stamp,
  }));

  await bumpPresenterCounts(presenterId, { documentCount: 1 });

  console.info(`[presenter] uploaded ${safeName} (${file.size} bytes) into case ${presenterId}`);
  return created.toObject();
};

/**
 * Documents with their parse state as it actually is.
 *
 * Every read goes through `presentParse`, so a parse abandoned by a dead
 * process reads as `stalled` everywhere — the rail, the bootstrap, the status
 * poll — rather than as a `running` that will never finish.
 */
export const listDocuments = async (presenterId: mongoose.Types.ObjectId) => {
  const documents = await PresenterDocument.find({ presenterId, isDeleted: false })
    .sort({ order: 1 })
    .lean();
  return documents.map((document) => ({ ...document, parse: presentParse(document.parse) }));
};

/**
 * Page text, but only from a parse that finished.
 *
 * Pages are written one at a time now, so a parse that fails partway leaves
 * real rows behind until its retry clears them. They are not a shorter
 * document — they are half of one, and serving them would let a reader
 * annotate passages that the next attempt deletes.
 *
 * The web reader already declines to ask for these, but that is a decision
 * made in a browser someone else could be running a different build of. The
 * rule belongs on the server.
 */
export const getPages = async (
  documentId: mongoose.Types.ObjectId,
  parseVersion: number,
  from: number,
  to: number,
) => {
  const document = await PresenterDocument.findById(documentId, { parse: 1 }).lean();
  if (!document || effectiveParseStatus(document.parse) !== "ready") return [];

  return PresenterPage.find({
    documentId,
    parseVersion,
    pageNumber: { $gte: from, $lte: to },
  })
    .sort({ pageNumber: 1 })
    .lean();
};

export const updateDocument = async (
  documentId: mongoose.Types.ObjectId,
  presenterId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  patch: { title?: string; folderId?: string | null; order?: number },
) => {
  const now = new Date();
  return withSeq(presenterId, (stamp) =>
    PresenterDocument.findOneAndUpdate(
      { _id: documentId, presenterId, isDeleted: false },
      { $set: { ...patch, updatedBy: userId, lastModifiedAt: now, ...stamp }, $inc: { version: 1 } },
      { new: true },
    ).lean(),
  );
};

/**
 * Remove a document from the case.
 *
 * A tombstone, the same shape as deleting a Point: `isDeleted` goes true and
 * the row stays, along with its pages and its file in blob storage.
 *
 * **What is anchored into it goes with it**, and that is the important part:
 *
 *   - Highlights and connections are tombstoned. They point at text that is no
 *     longer on screen, so leaving them alive would mean the tile counting
 *     excerpts nobody can reach and notches that do nothing when clicked.
 *   - Excerpt cards are tombstoned, and their references with them. An
 *     excerpt is a quotation of the document — it exists only because the
 *     document did, so it goes when the document goes.
 *   - Notes are left alone. A note is the reader's own writing, not the
 *     document's; it merely loses a citation that resolves. Deleting a PDF
 *     must never quietly delete something the reader wrote.
 *   - A note's references keep citing the document in `documentIds`, and the
 *     reader simply stops showing a chip for one that is no longer there.
 *
 * There is no way back through the UI: deleted means deleted to the person who
 * pressed it. The rows survive so an operator can still see what a case held,
 * until a purge job sweeps tombstones past their retention window.
 */
export const softDeleteDocument = async (
  documentId: mongoose.Types.ObjectId,
  presenterId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
) => {
  const now = new Date();
  /**
   * One sequence for the document and everything cascading off it.
   *
   * The tombstones have to reach a device together: a pull that delivered the
   * document's tombstone but stopped before its highlights' would leave that
   * device showing annotations anchored into a document it has just removed.
   * Sharing a sequence makes the whole cascade indivisible, because a pull
   * never splits one.
   */
  /*
   * The whole cascade is written under one leased sequence, so no pull can
   * see it half-done (A1), and a pull never splits a sequence however many
   * rows it holds (A2, see `pullSince`).
   */
  const outcome = await withSeq(presenterId, async (stamp) => {
    const removed = await PresenterDocument.findOneAndUpdate(
      { _id: documentId, presenterId, isDeleted: false },
      {
        $set: {
          isDeleted: true,
          deletedAt: now,
          updatedBy: userId,
          lastModifiedAt: now,
          ...stamp,
        },
        $inc: { version: 1 },
      },
      { new: true },
    ).lean();
    if (!removed) return null;

    const tombstone = {
      $set: {
        isDeleted: true,
        deletedAt: now,
        updatedBy: userId,
        lastModifiedAt: now,
        ...stamp,
      },
      $inc: { version: 1 },
    };
    /**
     * Excerpt cards quoted from this document, and the references hanging off
     * them. Collected before the tombstone so their ids are still findable.
     */
    const excerptIds = (
      await PresenterCard.find(
        { presenterId, documentId, kind: "excerpt", isDeleted: false },
        { _id: 1 },
      ).lean()
    ).map((card) => String(card._id));

    const [highlights, connections] = await Promise.all([
      PresenterHighlight.updateMany({ presenterId, documentId, isDeleted: false }, tombstone),
      PresenterConnection.updateMany({ presenterId, documentId, isDeleted: false }, tombstone),
    ]);

    let excerpts = 0;
    if (excerptIds.length > 0) {
      const [cards] = await Promise.all([
        PresenterCard.updateMany({ presenterId, _id: { $in: excerptIds } }, tombstone),
        PresenterLink.updateMany({ presenterId, cardId: { $in: excerptIds }, isDeleted: false }, tombstone),
        PresenterConnection.updateMany(
          { presenterId, cardId: { $in: excerptIds }, isDeleted: false },
          tombstone,
        ),
      ]);
      excerpts = cards.modifiedCount ?? 0;
    }

    // Those excerpts were on the tile and are not coming back through sync to
    // decrement themselves.
    await bumpPresenterCounts(presenterId, {
      documentCount: -1,
      excerptCount: -(highlights.modifiedCount ?? 0),
    });
    return { removed, highlights, connections, excerpts };
  });
  if (!outcome) return null;
  const { removed, highlights, connections, excerpts } = outcome;

  console.info(
    `[presenter] removed document ${documentId} from case ${presenterId}: ` +
      `${highlights.modifiedCount} highlight(s), ${connections.modifiedCount} connection(s) ` +
      `and ${excerpts} excerpt card(s) tombstoned with it`,
  );
  return { ...removed, parse: presentParse(removed.parse) };
};
