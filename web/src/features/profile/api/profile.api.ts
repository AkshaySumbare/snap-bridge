import { apiFetch } from "@/lib/api-client";
import { ApiError } from "@/lib/api-client";
import type { User } from "@/features/auth/types/auth.types";

interface ProfileAvatarResponse {
  user: User;
  message: string;
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

interface CloudinaryUploadResponse {
  public_id: string;
  secure_url: string;
  error?: { message: string };
}

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

export const profileApi = {
  getAvatarUploadSignature: () =>
    apiFetch<SignedUploadParams>("/profile/avatar/sign", { method: "POST" }),

  confirmAvatar: (publicId: string, secureUrl: string) =>
    apiFetch<ProfileAvatarResponse>("/profile/avatar/confirm", {
      method: "POST",
      body: JSON.stringify({ publicId, secureUrl }),
    }),

  deleteAvatar: () =>
    apiFetch<ProfileAvatarResponse>("/profile/avatar", {
      method: "DELETE",
    }),

  async uploadAvatar(file: File): Promise<ProfileAvatarResponse> {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      throw new ApiError(400, "Only JPEG, PNG, WebP, and GIF images are allowed");
    }

    if (file.size > MAX_AVATAR_SIZE) {
      throw new ApiError(400, "Image must be smaller than 5MB");
    }

    const sign = await profileApi.getAvatarUploadSignature();

    const formData = new FormData();
    formData.append("file", file);
    formData.append("api_key", sign.apiKey);
    formData.append("timestamp", String(sign.timestamp));
    formData.append("signature", sign.signature);
    formData.append("folder", sign.folder);
    formData.append("public_id", sign.publicId);
    formData.append("overwrite", sign.overwrite);

    const uploadRes = await fetch(sign.uploadUrl, {
      method: "POST",
      body: formData,
    });

    const uploadData = (await uploadRes.json()) as CloudinaryUploadResponse;

    if (!uploadRes.ok || uploadData.error) {
      throw new ApiError(
        uploadRes.status,
        uploadData.error?.message ?? "Failed to upload image to Cloudinary",
      );
    }

    return profileApi.confirmAvatar(uploadData.public_id, uploadData.secure_url);
  },
};
