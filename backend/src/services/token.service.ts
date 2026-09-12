import jwt, { type SignOptions } from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { getRedis } from "../db/redis.js";
import { AppError } from "../utils/errors.js";

const REFRESH_PREFIX = "refresh:";
const USER_REFRESH_PREFIX = "user-refresh:";
const PASSWORD_RESET_PREFIX = "password-reset:";

export interface AccessTokenPayload {
  userId: string;
  email: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

function refreshTtlSeconds(): number {
  const value = config.jwtRefreshExpiresIn;
  if (value.endsWith("d")) return Number(value.slice(0, -1)) * 24 * 60 * 60;
  if (value.endsWith("h")) return Number(value.slice(0, -1)) * 60 * 60;
  if (value.endsWith("m")) return Number(value.slice(0, -1)) * 60;
  return 7 * 24 * 60 * 60;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: config.jwtAccessExpiresIn as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, config.jwtAccessSecret, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, config.jwtAccessSecret) as AccessTokenPayload;
  } catch {
    throw new AppError(401, "Invalid or expired access token");
  }
}

export async function issueTokenPair(userId: string, email: string): Promise<TokenPair> {
  const redis = getRedis();
  const refreshToken = randomUUID();
  const ttl = refreshTtlSeconds();

  await redis.setEx(`${REFRESH_PREFIX}${refreshToken}`, ttl, userId);
  await redis.sAdd(`${USER_REFRESH_PREFIX}${userId}`, refreshToken);
  await redis.expire(`${USER_REFRESH_PREFIX}${userId}`, ttl);

  const accessToken = signAccessToken({ userId, email });

  return {
    accessToken,
    refreshToken,
    expiresIn: config.jwtAccessExpiresIn,
  };
}

export async function rotateRefreshToken(
  refreshToken: string,
): Promise<{ userId: string; email: string; tokens: TokenPair }> {
  const redis = getRedis();
  const userId = await redis.get(`${REFRESH_PREFIX}${refreshToken}`);

  if (!userId) {
    throw new AppError(401, "Invalid or expired refresh token");
  }

  await revokeRefreshToken(refreshToken);

  const { User } = await import("../models/User.js");
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(401, "User not found");
  }

  const tokens = await issueTokenPair(userId, user.email);
  return { userId, email: user.email, tokens };
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const redis = getRedis();
  const userId = await redis.get(`${REFRESH_PREFIX}${refreshToken}`);
  await redis.del(`${REFRESH_PREFIX}${refreshToken}`);
  if (userId) {
    await redis.sRem(`${USER_REFRESH_PREFIX}${userId}`, refreshToken);
  }
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  const redis = getRedis();
  const tokens = await redis.sMembers(`${USER_REFRESH_PREFIX}${userId}`);
  if (tokens.length > 0) {
    const keys = tokens.map((t) => `${REFRESH_PREFIX}${t}`);
    await redis.del(keys);
  }
  await redis.del(`${USER_REFRESH_PREFIX}${userId}`);
}

export async function createPasswordResetToken(userId: string): Promise<string> {
  const redis = getRedis();
  const token = randomUUID();
  await redis.setEx(`${PASSWORD_RESET_PREFIX}${token}`, config.passwordResetTtlSeconds, userId);
  return token;
}

export async function consumePasswordResetToken(token: string): Promise<string> {
  const redis = getRedis();
  const userId = await redis.get(`${PASSWORD_RESET_PREFIX}${token}`);
  if (!userId) {
    throw new AppError(400, "Invalid or expired reset token");
  }
  await redis.del(`${PASSWORD_RESET_PREFIX}${token}`);
  return userId;
}
