import express from "express";
import cors from "cors";
import type { Server as SocketServer } from "socket.io";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import deviceRoutes from "./routes/devices.js";
import screenshotRoutes from "./routes/screenshots.js";
import { createClipsRouter } from "./routes/clips.js";

export function createApp(io: SocketServer) {
  const app = express();

  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "snapbridge-api" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/devices", deviceRoutes);
  app.use("/api/clips", createClipsRouter(io));
  app.use("/api/screenshots", screenshotRoutes);

  return app;
}
