import type { Request, Response, NextFunction } from "express";
import { config } from "../config.js";

const METHOD_WIDTH = 7;
const PATH_WIDTH = 44;

function timestamp(): string {
  return new Date().toLocaleTimeString("en-IN", { hour12: false });
}

function statusText(status: number): string {
  if (status >= 500) return "Failed";
  if (status >= 400) return "Error";
  if (status === 201) return "Created";
  if (status === 204) return "No Content";
  if (status >= 200 && status < 300) return "OK";
  return "—";
}

function paint(text: string, code: string): string {
  if (!config.isDev) return text;
  return `${code}${text}\x1b[0m`;
}

function formatStatus(status: number): string {
  const label = `${status} ${statusText(status)}`;
  if (status >= 500) return paint(label, "\x1b[31m");
  if (status >= 400) return paint(label, "\x1b[33m");
  if (status >= 200 && status < 300) return paint(label, "\x1b[32m");
  return label;
}

function formatMethod(method: string): string {
  const padded = method.padEnd(METHOD_WIDTH);
  if (!config.isDev) return padded;
  const colors: Record<string, string> = {
    GET: "\x1b[36m",
    POST: "\x1b[33m",
    PUT: "\x1b[35m",
    PATCH: "\x1b[35m",
    DELETE: "\x1b[31m",
  };
  const code = colors[method] ?? "\x1b[37m";
  return paint(padded, code);
}

function truncatePath(path: string): string {
  if (path.length <= PATH_WIDTH) return path.padEnd(PATH_WIDTH);
  return `…${path.slice(-(PATH_WIDTH - 1))}`;
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = performance.now();
  const path = req.originalUrl || req.url;

  res.on("finish", () => {
    const ms = Math.round(performance.now() - start);
    const line = [
      paint(`[${timestamp()}]`, "\x1b[90m"),
      formatMethod(req.method),
      truncatePath(path),
      formatStatus(res.statusCode),
      paint(`${ms}ms`, "\x1b[90m"),
    ].join(" ");

    console.log(line);
  });

  next();
}
