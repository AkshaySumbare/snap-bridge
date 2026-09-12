import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type AccessTokenPayload } from "../services/token.service.js";
import { getAccessTokenFromRequest } from "../utils/cookies.js";

export interface AuthedRequest extends Request {
  auth: AccessTokenPayload;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = getAccessTokenFromRequest(req);

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    (req as AuthedRequest).auth = payload;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid or expired token";
    res.status(401).json({ error: message });
  }
}
