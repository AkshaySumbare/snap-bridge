import dotenv from "dotenv";

dotenv.config();
export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isDev: (process.env.NODE_ENV ?? "development") !== "production",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",

  cookieSecure: process.env.COOKIE_SECURE === "true",
  cookieSameSite: (process.env.COOKIE_SAME_SITE ?? "lax") as "lax" | "strict" | "none",

  mongodbUri: process.env.MONGODB_URI ?? "",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",

  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret-change-me",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret-change-me",
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",

  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:5173/api/auth/google/callback",
  googleOAuthSuccessRedirect:
    process.env.GOOGLE_OAUTH_SUCCESS_REDIRECT ?? "http://localhost:5173/dashboard",

  passwordResetTtlSeconds: Number(process.env.PASSWORD_RESET_TTL_SECONDS ?? 3600),

  frontendUrl: process.env.FRONTEND_URL ?? process.env.CORS_ORIGIN ?? "http://localhost:5173",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? "SnapBridge <onboarding@resend.dev>",

  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY ?? "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET ?? "",

  rateLimitAuthWindowMs: Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS ?? 15 * 60 * 1000),
  rateLimitAuthLimit: Number(process.env.RATE_LIMIT_AUTH_MAX ?? 10),
  rateLimitApiWindowMs: Number(process.env.RATE_LIMIT_API_WINDOW_MS ?? 15 * 60 * 1000),
  rateLimitApiLimit: Number(process.env.RATE_LIMIT_API_MAX ?? 100),

  // Vault + semantic search (Phase 2)
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  embeddingModel: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
  embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS ?? 1536),
  chatModel: process.env.CHAT_MODEL ?? "gpt-4o-mini",
  vaultChunkSize: Number(process.env.VAULT_CHUNK_SIZE ?? 800),
  vaultChunkOverlap: Number(process.env.VAULT_CHUNK_OVERLAP ?? 100),
  vaultMaxFileBytes: Number(process.env.VAULT_MAX_FILE_BYTES ?? 10 * 1024 * 1024),
  vaultOcrEnabled: process.env.VAULT_OCR_ENABLED !== "false",
  vectorSearchIndexName: process.env.VECTOR_SEARCH_INDEX_NAME ?? "chunk_embedding_index",
  vectorSearchNumCandidates: Number(process.env.VECTOR_SEARCH_NUM_CANDIDATES ?? 100),
  vectorSearchLimit: Number(process.env.VECTOR_SEARCH_LIMIT ?? 8),
};

export function validateConfig(): void {
  if (!config.mongodbUri) {
    throw new Error("MONGODB_URI is required. Add it to backend/.env");
  }
}
