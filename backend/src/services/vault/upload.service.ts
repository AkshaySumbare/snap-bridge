import { randomUUID } from "node:crypto";
import mime from "mime-types";
import {
  generateSignedUploadParams,
  verifyUploadedAsset,
  type CloudinaryResourceType,
} from "../cloudinary.service.js";
import { VAULT_ALLOWED_MIME_TYPES } from "../../config/vault.js";
import { config } from "../../config.js";
import { AppError } from "../../utils/errors.js";

export function vaultFolderForUser(userId: string): string {
  return `snapbridge/vault/${userId}`;
}

export function assertAllowedMimeType(mimeType: string): void {
  if (!VAULT_ALLOWED_MIME_TYPES.includes(mimeType as (typeof VAULT_ALLOWED_MIME_TYPES)[number])) {
    throw new AppError(
      400,
      `File type not allowed. Supported: PDF, DOCX, JPEG, PNG, WEBP, GIF`,
    );
  }
}

export function resolveCloudinaryResourceType(mimeType: string): CloudinaryResourceType {
  if (mimeType.startsWith("image/")) return "image";
  return "raw";
}

export function getUploadSignature(userId: string, mimeType: string, fileName?: string) {
  assertAllowedMimeType(mimeType);

  const resourceType = resolveCloudinaryResourceType(mimeType);
  const extension = mime.extension(mimeType) || "bin";
  const baseName = fileName
    ? fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 40)
    : "document";
  const publicId = `${baseName}-${randomUUID().slice(0, 8)}.${extension}`;

  const params = generateSignedUploadParams({
    folder: vaultFolderForUser(userId),
    publicId,
    resourceType,
  });

  return {
    ...params,
    mimeType,
    resourceType,
    maxBytes: config.vaultMaxFileBytes,
  };
}

export async function verifyVaultUpload(
  publicId: string,
  resourceType: CloudinaryResourceType,
) {
  const asset = await verifyUploadedAsset(publicId, resourceType);
  if (asset.bytes > config.vaultMaxFileBytes) {
    throw new AppError(400, `File exceeds maximum size of ${config.vaultMaxFileBytes} bytes`);
  }
  return asset;
}
