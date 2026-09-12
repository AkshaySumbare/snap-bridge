import type { HydratedDocument } from "mongoose";
import type { IUserDocument } from "../models/User.js";
import { User, toPublicUser } from "../models/User.js";
import { AppError } from "../utils/errors.js";
import {
  CLOUDINARY_FOLDERS,
  deleteAsset,
  generateSignedUploadParams,
  uploadImageFromUrl,
  verifyUploadedAsset,
  type SignedUploadParams,
} from "./cloudinary.service.js";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

function avatarPublicId(userId: string): string {
  return `avatar_${userId}`;
}

function expectedAvatarPublicId(userId: string): string {
  return `${CLOUDINARY_FOLDERS.profile}/${avatarPublicId(userId)}`;
}

async function removeStoredAvatar(user: HydratedDocument<IUserDocument>): Promise<void> {
  if (!user.avatarPublicId) return;
  await deleteAsset(user.avatarPublicId, "image");
}

export function getAvatarUploadSignature(userId: string): SignedUploadParams {
  return generateSignedUploadParams({
    folder: CLOUDINARY_FOLDERS.profile,
    publicId: avatarPublicId(userId),
    resourceType: "image",
  });
}

export async function confirmAvatarUpload(
  userId: string,
  publicId: string,
  secureUrl: string,
) {
  const expectedPublicId = expectedAvatarPublicId(userId);

  if (publicId !== expectedPublicId) {
    throw new AppError(400, "Invalid upload reference");
  }

  const resource = await verifyUploadedAsset(publicId, "image");

  if (resource.bytes > MAX_AVATAR_SIZE) {
    await deleteAsset(publicId, "image");
    throw new AppError(400, "Image must be smaller than 5MB");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, "User not found");
  }

  if (user.avatarPublicId && user.avatarPublicId !== publicId) {
    await deleteAsset(user.avatarPublicId, "image");
  }

  user.avatarUrl = secureUrl;
  user.avatarPublicId = publicId;
  user.avatarSource = "upload";
  await user.save();

  return toPublicUser(user);
}

export async function deleteUserAvatar(userId: string) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, "User not found");
  }

  if (!user.avatarPublicId) {
    throw new AppError(400, "No profile image to delete");
  }

  await removeStoredAvatar(user);

  user.avatarUrl = undefined;
  user.avatarPublicId = undefined;
  user.avatarSource = undefined;
  await user.save();

  return toPublicUser(user);
}

export async function syncGoogleAvatarIfNeeded(
  user: HydratedDocument<IUserDocument>,
  pictureUrl?: string,
): Promise<void> {
  if (!pictureUrl || user.avatarUrl) {
    return;
  }

  try {
    await removeStoredAvatar(user);

    const upload = await uploadImageFromUrl(pictureUrl, {
      folder: CLOUDINARY_FOLDERS.profile,
      publicId: avatarPublicId(user._id.toString()),
    });

    user.avatarUrl = upload.secureUrl;
    user.avatarPublicId = upload.publicId;
    user.avatarSource = "google";
    await user.save();
  } catch (err) {
    console.error("[profile] Failed to sync Google avatar:", err);
  }
}
