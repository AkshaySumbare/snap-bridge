import type { RequestHandler } from "express";
import { rateLimit, type RateLimitRequestHandler } from "express-rate-limit";
import { config } from "../config.js";
import { getRedis } from "../db/redis.js";
import { RedisRateLimitStore } from "../stores/redis-rate-limit.store.js";

let authRateLimiterHandler: RateLimitRequestHandler | null = null;
let apiRateLimiterHandler: RateLimitRequestHandler | null = null;

function buildLimiter(options: {
  windowMs: number;
  limit: number;
  message: string;
  prefix: string;
}): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    passOnStoreError: true,
    message: { error: options.message },
    store: new RedisRateLimitStore(options.prefix),
  });
}

export async function initRateLimiters(): Promise<void> {
  await getRedis().ping();

  authRateLimiterHandler = buildLimiter({
    windowMs: config.rateLimitAuthWindowMs,
    limit: config.rateLimitAuthLimit,
    message: "Too many auth attempts. Please try again later.",
    prefix: "rl:auth:",
  });

  apiRateLimiterHandler = buildLimiter({
    windowMs: config.rateLimitApiWindowMs,
    limit: config.rateLimitApiLimit,
    message: "Too many requests. Please try again later.",
    prefix: "rl:api:",
  });

  console.log("Rate limiters ready (auth + api)");
}

function wrapLimiter(getHandler: () => RateLimitRequestHandler | null): RequestHandler {
  return (req, res, next) => {
    const handler = getHandler();
    if (!handler) {
      next(new Error("Rate limiters not initialized"));
      return;
    }
    handler(req, res, next);
  };
}

export const authRateLimiter = wrapLimiter(() => authRateLimiterHandler);
export const apiRateLimiter = wrapLimiter(() => apiRateLimiterHandler);
