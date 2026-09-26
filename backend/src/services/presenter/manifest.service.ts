import mongoose from "mongoose";

import Presenter from "../../models/presenter/presenter.model.js";
import PresenterDocument from "../../models/presenter/presenterDocument.model.js";
import { PRESENTER_CONTAINER, publicDownloadUrl } from "./blob.js";
import { computeVisibleSeq } from "./seq.js";

/**
 * The download plan for a whole case, in one call.
 *
 * This is what "Make available offline" runs on. A device needs three things
 * before it can commit to a download it will rely on in court: what the files
 * are, how big the whole thing is, and how to tell afterwards that it got them
 * intact. `download-urls` answers only the first — it mints URLs per document
 * and says nothing about the case as a whole — so a client using it cannot show
 * a size, cannot check free space, and cannot skip a file it already holds.
 *
 * Nothing large passes through this service: the response is a few hundred
 * bytes of JSON and the bytes come from Azure directly.
 *
 * `caseSeq` is the case's sync cursor at the moment the manifest was built. A
 * device that stores it alongside the files can ask later whether its offline
 * copy is still current without downloading anything.
 */

export const DEFAULT_MANIFEST_EXPIRY_MINUTES = 240;
const MAX_EXPIRY_MINUTES = 240;

export interface ManifestFile {
  url: string;
  sizeBytes: number;
  sha256: string | null;
  /** Present on the bundle: it is stored gzipped. */
  encoding?: "gzip";
}

export interface ManifestDocument {
  documentId: string;
  title: string;
  version: number;
  parseVersion: number;
  pageCount: number;
  pdf: ManifestFile;
  /**
   * Absent for a document parsed before bundles were written, and for one whose
   * parse has not finished. A client without a bundle falls back to paging
   * `/pages`; it is slower, not broken.
   */
  bundle?: ManifestFile;
}

export interface OfflineManifest {
  presenterId: string;
  name: string;
  client: string;
  caseSeq: number;
  totalBytes: number;
  documents: ManifestDocument[];
  expiresAt: string;
}

export const buildOfflineManifest = async (
  presenterId: mongoose.Types.ObjectId,
  expiryMinutes: number,
  actor: { userId: string },
): Promise<OfflineManifest> => {
  const expiry = Math.min(Math.max(expiryMinutes, 5), MAX_EXPIRY_MINUTES);

  const [caseRow, documents] = await Promise.all([
    Presenter.findById(presenterId, { name: 1, client: 1, seq: 1, seqPending: 1 }).lean(),
    PresenterDocument.find({ presenterId, isDeleted: false }).sort({ order: 1 }).lean(),
  ]);

  let totalBytes = 0;
  const entries: ManifestDocument[] = [];

  for (const document of documents) {
    totalBytes += document.blob.sizeBytes ?? 0;

    const entry: ManifestDocument = {
      documentId: String(document._id),
      title: document.title,
      version: document.version,
      parseVersion: document.parse.version,
      pageCount: document.parse.pageCount,
      pdf: {
        url: publicDownloadUrl(document.blob.path, document.blob.secureUrl),
        sizeBytes: document.blob.sizeBytes ?? 0,
        sha256: document.blob.checksumSha256,
      },
    };

    if (document.parse.status === "ready" && document.parse.bundleBlobPath) {
      totalBytes += document.parse.bundleSizeBytes ?? 0;
      entry.bundle = {
        url: publicDownloadUrl(document.parse.bundleBlobPath),
        sizeBytes: document.parse.bundleSizeBytes ?? 0,
        sha256: document.parse.bundleSha256,
        encoding: "gzip",
      };
    }

    entries.push(entry);
  }

  // These URLs outlive the request and cannot be revoked, so handing out a
  // whole case's worth is worth a line in the log.
  console.info(
    `[presenter] offline manifest for case ${presenterId} by user ${actor.userId}: ` +
      `${entries.length} document(s), ${totalBytes} bytes, expiring in ${expiry}m`,
  );

  return {
    presenterId: String(presenterId),
    name: caseRow?.name ?? "",
    client: caseRow?.client ?? "",
    // The visible ceiling, not the raw counter — see `seq.ts`.
    caseSeq: computeVisibleSeq(caseRow),
    totalBytes,
    documents: entries,
    expiresAt: new Date(Date.now() + expiry * 60 * 1000).toISOString(),
  };
};
