import mongoose from "mongoose";
import PresenterDocument from "../../models/presenter/presenterDocument.model.js";
import { PRESENTER_CONTAINER, publicDownloadUrl } from "./blob.js";

export const DEFAULT_EXPIRY_MINUTES = 60;

export interface DownloadTarget {
  documentId: string;
  title: string;
  kind: "pdf" | "parseBundle";
  url: string;
  sizeBytes: number;
  checksumSha256: string | null;
  parseVersion?: number;
}

export const buildDownloadUrls = async (
  presenterId: mongoose.Types.ObjectId,
  documentIds: string[] | null,
  _expiryMinutes: number,
  actor: { userId: string },
): Promise<{ expiresAt: string; files: DownloadTarget[] }> => {
  const filter: Record<string, unknown> = { presenterId, isDeleted: false };
  if (documentIds && documentIds.length > 0) {
    filter._id = { $in: documentIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }
  const documents = await PresenterDocument.find(filter).lean();
  const files: DownloadTarget[] = [];

  for (const document of documents) {
    files.push({
      documentId: String(document._id),
      title: document.title,
      kind: "pdf",
      url: publicDownloadUrl(document.blob.path, document.blob.secureUrl),
      sizeBytes: document.blob.sizeBytes,
      checksumSha256: document.blob.checksumSha256,
    });

    if (document.parse.status === "ready" && document.parse.bundleBlobPath) {
      files.push({
        documentId: String(document._id),
        title: document.title,
        kind: "parseBundle",
        url: publicDownloadUrl(document.parse.bundleBlobPath),
        sizeBytes: document.parse.bundleSizeBytes ?? 0,
        checksumSha256: document.parse.bundleSha256,
        parseVersion: document.parse.version,
      });
    }
  }

  console.info(
    `[presenter] minted ${files.length} Cloudinary URL(s) for case ${presenterId} by user ${actor.userId}`,
  );

  return {
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    files,
  };
};

void PRESENTER_CONTAINER;
