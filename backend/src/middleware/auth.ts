import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type AccessTokenPayload } from "../services/token.service.js";

export interface AuthedRequest extends Request {
  auth: AccessTokenPayload;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  try {
    const token = header.slice(7);
    const payload = verifyAccessToken(token);
    (req as AuthedRequest).auth = payload;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid or expired token";
    res.status(401).json({ error: message });
  }
}
