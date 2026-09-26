import { cloudinary } from "../../config/cloudinary.js";
import { deleteAsset, uploadFileBuffer } from "../cloudinary.service.js";

/**
 * Presenter file storage on Cloudinary (raw uploads).
 * Path convention matches the original Azure layout so mobile offline
 * clients still see case/document-scoped keys.
 */

export const PRESENTER_CONTAINER = "cloudinary";
export const PRESENTER_FOLDER = "snapbridge/presenter";

export const documentBlobPath = (presenterId: string, documentId: string, fileName: string): string =>
  `presenters/${presenterId}/${documentId}/${fileName}`;

export const bundleBlobPath = (presenterId: string, documentId: string, parseVersion: number): string =>
  `presenters/${presenterId}/${documentId}/parse/v${parseVersion}/bundle.json`;

export const presenterBlobPrefix = (presenterId: string): string => `presenters/${presenterId}/`;

export const documentBlobPrefix = (presenterId: string, documentId: string): string =>
  `presenters/${presenterId}/${documentId}/`;

function publicIdFromPath(blobPath: string): string {
  return `${PRESENTER_FOLDER}/${blobPath.replace(/\.[^.]+$/, "")}`;
}

export async function uploadBuffer(
  blobPath: string,
  body: Buffer,
  contentType: string,
  _cacheControl?: string,
  _container: string = PRESENTER_CONTAINER,
): Promise<{ publicId: string; secureUrl: string }> {
  const publicId = publicIdFromPath(blobPath);
  const uploaded = await uploadFileBuffer(body, {
    folder: PRESENTER_FOLDER,
    publicId: blobPath.replace(/\.[^.]+$/, ""),
    resourceType: "raw",
    mimeType: contentType,
  });
  return { publicId: uploaded.publicId || publicId, secureUrl: uploaded.secureUrl };
}

export async function downloadBuffer(
  blobPath: string,
  _container: string = PRESENTER_CONTAINER,
  secureUrl?: string | null,
): Promise<Buffer> {
  const url = secureUrl || cloudinary.url(publicIdFromPath(blobPath), {
    resource_type: "raw",
    secure: true,
  });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download presenter file (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export function publicDownloadUrl(blobPath: string, secureUrl?: string | null): string {
  if (secureUrl) return secureUrl;
  return cloudinary.url(publicIdFromPath(blobPath), {
    resource_type: "raw",
    secure: true,
    sign_url: true,
    type: "authenticated",
  });
}

export async function deleteBlob(blobPath: string): Promise<void> {
  await deleteAsset(publicIdFromPath(blobPath), "raw").catch(() => undefined);
}

export async function deleteBlobsByPrefix(prefix: string): Promise<number> {
  const folder = `${PRESENTER_FOLDER}/${prefix.replace(/\/$/, "")}`;
  try {
    const result = await cloudinary.api.delete_resources_by_prefix(folder, { resource_type: "raw" });
    const deleted = result?.deleted ? Object.keys(result.deleted).length : 0;
    console.info(`[presenter] deleted ${deleted} Cloudinary raw asset(s) under ${folder}`);
    return deleted;
  } catch (err) {
    console.warn("[presenter] Cloudinary prefix delete failed", err);
    return 0;
  }
}
