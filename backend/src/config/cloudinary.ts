import { v2 as cloudinary } from "cloudinary";
import { config } from "../config.js";

export function initCloudinary(): void {
  if (!config.cloudinaryCloudName || !config.cloudinaryApiKey || !config.cloudinaryApiSecret) {
    if (!config.isDev) {
      console.warn("[cloudinary] Credentials missing — media uploads disabled");
    }
    return;
  }

  cloudinary.config({
    cloud_name: config.cloudinaryCloudName,
    api_key: config.cloudinaryApiKey,
    api_secret: config.cloudinaryApiSecret,
    secure: true,
  });
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    config.cloudinaryCloudName && config.cloudinaryApiKey && config.cloudinaryApiSecret,
  );
}

export { cloudinary };
