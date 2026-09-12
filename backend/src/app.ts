import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import profileRoutes from "./routes/profile.js";
import { apiRateLimiter } from "./middleware/rateLimit.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "snapbridge-api" });
  });

  // Auth has its own stricter rate limiter inside auth routes
  app.use("/api/auth", authRoutes);

  // General rate limiter for all future non-auth API routes
  app.use(apiRateLimiter);

  app.use("/api/profile", profileRoutes);

  app.use(errorHandler);

  return app;
}
