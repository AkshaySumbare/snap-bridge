import type {
  ClientRateLimitInfo,
  IncrementResponse,
  Options,
  Store,
} from "express-rate-limit";
import { getRedis } from "../db/redis.js";

export class RedisRateLimitStore implements Store {
  localKeys = false;
  prefix: string;
  private windowMs = 0;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private redisKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const redis = getRedis();
    const redisKey = this.redisKey(key);
    const totalHits = await redis.incr(redisKey);

    if (totalHits === 1) {
      await redis.pExpire(redisKey, this.windowMs);
    }

    const ttlMs = await redis.pTTL(redisKey);
    const resetTime = ttlMs > 0 ? new Date(Date.now() + ttlMs) : undefined;

    return { totalHits, resetTime };
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const redis = getRedis();
    const redisKey = this.redisKey(key);
    const value = await redis.get(redisKey);

    if (!value) {
      return undefined;
    }

    const ttlMs = await redis.pTTL(redisKey);
    const resetTime = ttlMs > 0 ? new Date(Date.now() + ttlMs) : undefined;

    return { totalHits: Number.parseInt(value, 10), resetTime };
  }

  async decrement(key: string): Promise<void> {
    const redis = getRedis();
    await redis.decr(this.redisKey(key));
  }

  async resetKey(key: string): Promise<void> {
    const redis = getRedis();
    await redis.del(this.redisKey(key));
  }
}
