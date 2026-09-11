import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { db } from "../db.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import type { Server as SocketServer } from "socket.io";

const router = Router();

const createClipSchema = z.object({
  content: z.string().min(1).max(100_000),
  contentType: z.enum(["text", "link", "code"]).default("text"),
  deviceId: z.string().uuid().optional(),
});

export function createClipsRouter(io: SocketServer) {
  router.post("/", requireAuth, (req, res) => {
    const parsed = createClipSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { auth } = req as AuthedRequest;
    const id = uuid();
    const { content, contentType, deviceId } = parsed.data;

    db.prepare(
      "INSERT INTO clips (id, user_id, device_id, content, content_type) VALUES (?, ?, ?, ?, ?)",
    ).run(id, auth.userId, deviceId ?? null, content, contentType);

    const clip = db
      .prepare(
        "SELECT id, content, content_type, starred, device_id, created_at FROM clips WHERE id = ?",
      )
      .get(id);

    io.to(`user:${auth.userId}`).emit("clip:new", clip);
    res.status(201).json({ clip });
  });

  router.get("/", requireAuth, (req, res) => {
    const { auth } = req as AuthedRequest;
    const search = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const limit = Math.min(Number(req.query.limit ?? 100), 100);

    const clips = search
      ? db
          .prepare(
            `SELECT id, content, content_type, starred, device_id, created_at
             FROM clips
             WHERE user_id = ? AND content LIKE ?
             ORDER BY created_at DESC
             LIMIT ?`,
          )
          .all(auth.userId, `%${search}%`, limit)
      : db
          .prepare(
            `SELECT id, content, content_type, starred, device_id, created_at
             FROM clips
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT ?`,
          )
          .all(auth.userId, limit);

    res.json({ clips });
  });

  router.patch("/:clipId/star", requireAuth, (req, res) => {
    const { auth } = req as AuthedRequest;
    const starred = req.body.starred ? 1 : 0;
    const result = db
      .prepare("UPDATE clips SET starred = ? WHERE id = ? AND user_id = ?")
      .run(starred, req.params.clipId, auth.userId);

    if (result.changes === 0) {
      res.status(404).json({ error: "Clip not found" });
      return;
    }

    res.json({ starred: Boolean(starred) });
  });

  router.delete("/:clipId", requireAuth, (req, res) => {
    const { auth } = req as AuthedRequest;
    const result = db
      .prepare("DELETE FROM clips WHERE id = ? AND user_id = ?")
      .run(req.params.clipId, auth.userId);

    if (result.changes === 0) {
      res.status(404).json({ error: "Clip not found" });
      return;
    }

    io.to(`user:${auth.userId}`).emit("clip:deleted", { id: req.params.clipId });
    res.status(204).send();
  });

  return router;
}
