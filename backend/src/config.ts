import dotenv from "dotenv";

dotenv.config();
export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isDev: (process.env.NODE_ENV ?? "development") !== "production",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",

  mongodbUri: process.env.MONGODB_URI ?? "",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",

  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret-change-me",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret-change-me",
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",

  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:4000/api/auth/google/callback",
  googleOAuthSuccessRedirect:
    process.env.GOOGLE_OAUTH_SUCCESS_REDIRECT ?? "http://localhost:5173/auth/callback",

  passwordResetTtlSeconds: Number(process.env.PASSWORD_RESET_TTL_SECONDS ?? 3600),

  rateLimitAuthWindowMs: Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS ?? 15 * 60 * 1000),
  rateLimitAuthLimit: Number(process.env.RATE_LIMIT_AUTH_MAX ?? 10),
  rateLimitApiWindowMs: Number(process.env.RATE_LIMIT_API_WINDOW_MS ?? 15 * 60 * 1000),
  rateLimitApiLimit: Number(process.env.RATE_LIMIT_API_MAX ?? 100),
};

export function validateConfig(): void {
  if (!config.mongodbUri) {
    throw new Error("MONGODB_URI is required. Add it to backend/.env");
  }
}
