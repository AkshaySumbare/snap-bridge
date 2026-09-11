import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { db } from "../db.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

const router = Router();

const pairingRequestSchema = z.object({
  deviceName: z.string().min(1).max(100),
  platform: z.enum(["web", "android", "ios", "desktop"]),
});

const pairConfirmSchema = z.object({
  code: z.string().length(6),
  deviceName: z.string().min(1).max(100),
  platform: z.enum(["web", "android", "ios", "desktop"]),
});

router.post("/pairing-code", requireAuth, (req, res) => {
  const parsed = pairingRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { auth } = req as AuthedRequest;
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  db.prepare(
    "INSERT INTO pairing_codes (code, user_id, device_name, platform, expires_at) VALUES (?, ?, ?, ?, ?)",
  ).run(code, auth.userId, parsed.data.deviceName, parsed.data.platform, expiresAt);

  res.json({ code, expiresAt, qrPayload: `snapbridge://pair?code=${code}` });
});

router.post("/pair", (req, res) => {
  const parsed = pairConfirmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const row = db
    .prepare(
      "SELECT code, user_id, expires_at, used_at FROM pairing_codes WHERE code = ?",
    )
    .get(parsed.data.code) as
    | { code: string; user_id: string; expires_at: string; used_at: string | null }
    | undefined;

  if (!row || row.used_at) {
    res.status(404).json({ error: "Invalid or already used pairing code" });
    return;
  }

  if (new Date(row.expires_at) < new Date()) {
    res.status(410).json({ error: "Pairing code expired" });
    return;
  }

  const deviceId = uuid();
  db.prepare(
    "INSERT INTO devices (id, user_id, name, platform, last_seen_at) VALUES (?, ?, ?, ?, datetime('now'))",
  ).run(deviceId, row.user_id, parsed.data.deviceName, parsed.data.platform);

  db.prepare("UPDATE pairing_codes SET used_at = datetime('now') WHERE code = ?").run(
    parsed.data.code,
  );

  const user = db
    .prepare("SELECT id, email FROM users WHERE id = ?")
    .get(row.user_id) as { id: string; email: string };

  res.status(201).json({
    device: {
      id: deviceId,
      name: parsed.data.deviceName,
      platform: parsed.data.platform,
    },
    user,
  });
});

router.get("/", requireAuth, (req, res) => {
  const { auth } = req as AuthedRequest;
  const devices = db
    .prepare(
      "SELECT id, name, platform, last_seen_at, created_at FROM devices WHERE user_id = ? ORDER BY created_at DESC",
    )
    .all(auth.userId);

  res.json({ devices });
});

router.delete("/:deviceId", requireAuth, (req, res) => {
  const { auth } = req as AuthedRequest;
  const result = db
    .prepare("DELETE FROM devices WHERE id = ? AND user_id = ?")
    .run(req.params.deviceId, auth.userId);

  if (result.changes === 0) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  res.status(204).send();
});

export default router;
