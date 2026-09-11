import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { v4 as uuid } from "uuid";
import { db } from "../db.js";
import { config } from "../config.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

const router = Router();

if (!fs.existsSync(config.uploadDir)) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: config.uploadDir,
  filename: (_req, file, cb) => {
    cb(null, `${uuid()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image uploads are allowed"));
    }
  },
});

// Placeholder OCR — Phase 1 will integrate Tesseract or cloud OCR
function extractOcrText(_filename: string): string {
  return "";
}

router.post("/", requireAuth, upload.single("image"), (req, res) => {
  const { auth } = req as AuthedRequest;
  if (!req.file) {
    res.status(400).json({ error: "Image file required" });
    return;
  }

  const id = uuid();
  const deviceId = typeof req.body.deviceId === "string" ? req.body.deviceId : null;
  const ocrText = extractOcrText(req.file.filename);

  db.prepare(
    "INSERT INTO screenshots (id, user_id, device_id, filename, mime_type, ocr_text) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, auth.userId, deviceId, req.file.filename, req.file.mimetype, ocrText);

  const screenshot = db
    .prepare(
      "SELECT id, filename, mime_type, ocr_text, starred, device_id, created_at FROM screenshots WHERE id = ?",
    )
    .get(id);

  res.status(201).json({ screenshot });
});

router.get("/", requireAuth, (req, res) => {
  const { auth } = req as AuthedRequest;
  const search = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const limit = Math.min(Number(req.query.limit ?? 100), 100);

  const screenshots = search
    ? db
        .prepare(
          `SELECT id, filename, mime_type, ocr_text, starred, device_id, created_at
           FROM screenshots
           WHERE user_id = ? AND (ocr_text LIKE ? OR filename LIKE ?)
           ORDER BY created_at DESC
           LIMIT ?`,
        )
        .all(auth.userId, `%${search}%`, `%${search}%`, limit)
    : db
        .prepare(
          `SELECT id, filename, mime_type, ocr_text, starred, device_id, created_at
           FROM screenshots
           WHERE user_id = ?
           ORDER BY created_at DESC
           LIMIT ?`,
        )
        .all(auth.userId, limit);

  res.json({ screenshots });
});

router.get("/:screenshotId/file", requireAuth, (req, res) => {
  const { auth } = req as AuthedRequest;
  const row = db
    .prepare("SELECT filename, mime_type FROM screenshots WHERE id = ? AND user_id = ?")
    .get(req.params.screenshotId, auth.userId) as
    | { filename: string; mime_type: string }
    | undefined;

  if (!row) {
    res.status(404).json({ error: "Screenshot not found" });
    return;
  }

  res.sendFile(path.resolve(config.uploadDir, row.filename), {
    headers: { "Content-Type": row.mime_type },
  });
});

export default router;
