import { cloudinary, isCloudinaryConfigured } from "../config/cloudinary.js";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";

export type CloudinaryResourceType = "image" | "video" | "raw" | "auto";

export interface CloudinaryUploadResult {
  publicId: string;
  url: string;
  secureUrl: string;
  resourceType: string;
  format: string;
  bytes: number;
}

export const CLOUDINARY_FOLDERS = {
  profile: "snapbridge/users/profile",
  images: "snapbridge/images",
  videos: "snapbridge/videos",
  documents: "snapbridge/documents",
} as const;

function mapUploadResult(result: {
  public_id: string;
  url: string;
  secure_url: string;
  resource_type: string;
  format: string;
  bytes: number;
}): CloudinaryUploadResult {
  return {
    publicId: result.public_id,
    url: result.url,
    secureUrl: result.secure_url,
    resourceType: result.resource_type,
    format: result.format,
    bytes: result.bytes,
  };
}

function assertConfigured(): void {
  if (!isCloudinaryConfigured()) {
    throw new AppError(500, "Cloudinary is not configured");
  }
}

export async function uploadImageBuffer(
  buffer: Buffer,
  options: {
    folder: string;
    publicId?: string;
    mimeType?: string;
  },
): Promise<CloudinaryUploadResult> {
  assertConfigured();

  const dataUri = `data:${options.mimeType ?? "image/jpeg"};base64,${buffer.toString("base64")}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: options.folder,
    public_id: options.publicId,
    overwrite: Boolean(options.publicId),
    resource_type: "image",
  });

  return mapUploadResult(result);
}

export async function uploadImageFromUrl(
  url: string,
  options: {
    folder: string;
    publicId?: string;
  },
): Promise<CloudinaryUploadResult> {
  assertConfigured();

  const result = await cloudinary.uploader.upload(url, {
    folder: options.folder,
    public_id: options.publicId,
    overwrite: Boolean(options.publicId),
    resource_type: "image",
  });

  return mapUploadResult(result);
}

export async function uploadFileBuffer(
  buffer: Buffer,
  options: {
    folder: string;
    resourceType: CloudinaryResourceType;
    publicId?: string;
    mimeType?: string;
  },
): Promise<CloudinaryUploadResult> {
  assertConfigured();

  const dataUri = `data:${options.mimeType ?? "application/octet-stream"};base64,${buffer.toString("base64")}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: options.folder,
    public_id: options.publicId,
    overwrite: Boolean(options.publicId),
    resource_type: options.resourceType,
  });

  return mapUploadResult(result);
}

export interface SignedUploadParams {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  publicId: string;
  overwrite: string;
  uploadUrl: string;
}

export function generateSignedUploadParams(options: {
  folder: string;
  publicId: string;
  resourceType?: CloudinaryResourceType;
}): SignedUploadParams {
  assertConfigured();

  const timestamp = Math.round(Date.now() / 1000);
  const resourceType = options.resourceType ?? "image";

  const paramsToSign = {
    timestamp,
    folder: options.folder,
    public_id: options.publicId,
    overwrite: "true",
  };

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    config.cloudinaryApiSecret,
  );

  return {
    signature,
    timestamp,
    apiKey: config.cloudinaryApiKey,
    cloudName: config.cloudinaryCloudName,
    folder: options.folder,
    publicId: options.publicId,
    overwrite: "true",
    uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudinaryCloudName}/${resourceType}/upload`,
  };
}

export async function verifyUploadedAsset(
  publicId: string,
  resourceType: CloudinaryResourceType = "image",
) {
  assertConfigured();

  try {
    return await cloudinary.api.resource(publicId, { resource_type: resourceType });
  } catch {
    throw new AppError(400, "Uploaded file could not be verified");
  }
}

export async function deleteAsset(
  publicId: string,
  resourceType: CloudinaryResourceType = "image",
): Promise<void> {
  if (!isCloudinaryConfigured()) return;

  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.error("[cloudinary] Failed to delete asset:", publicId, err);
    throw new AppError(500, "Failed to delete file from storage");
  }
}
