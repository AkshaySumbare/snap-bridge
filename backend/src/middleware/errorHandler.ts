import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors.js";
import { config } from "../config.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (err instanceof Error && err.name === "ValidationError") {
    res.status(400).json({ error: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: config.isDev && err instanceof Error ? err.message : "Internal server error",
  });
}
