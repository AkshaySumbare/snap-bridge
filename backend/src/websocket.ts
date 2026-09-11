import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import type { AuthPayload } from "./middleware/auth.js";
import { db } from "./db.js";

export function setupWebSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.corsOrigin },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) {
      next(new Error("Authentication required"));
      return;
    }

    try {
      const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
      socket.data.auth = payload;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const auth = socket.data.auth as AuthPayload;
    socket.join(`user:${auth.userId}`);

    const deviceId = socket.handshake.auth.deviceId as string | undefined;
    if (deviceId) {
      db.prepare("UPDATE devices SET last_seen_at = datetime('now') WHERE id = ? AND user_id = ?").run(
        deviceId,
        auth.userId,
      );
      socket.to(`user:${auth.userId}`).emit("device:online", { deviceId });
    }

    socket.on("clip:sync", (payload: { content: string; contentType?: string; deviceId?: string }) => {
      if (!payload?.content) return;
      socket.to(`user:${auth.userId}`).emit("clip:incoming", {
        content: payload.content,
        contentType: payload.contentType ?? "text",
        fromDeviceId: payload.deviceId,
        receivedAt: new Date().toISOString(),
      });
    });

    socket.on("disconnect", () => {
      if (deviceId) {
        socket.to(`user:${auth.userId}`).emit("device:offline", { deviceId });
      }
    });
  });

  return io;
}
