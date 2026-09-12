import type { Request, Response } from "express";
import { config } from "../config.js";
import type { TokenPair } from "../services/token.service.js";

export const ACCESS_TOKEN_COOKIE = "sb_access_token";
export const REFRESH_TOKEN_COOKIE = "sb_refresh_token";

function parseDurationToMs(value: string): number {
  if (value.endsWith("d")) return Number(value.slice(0, -1)) * 24 * 60 * 60 * 1000;
  if (value.endsWith("h")) return Number(value.slice(0, -1)) * 60 * 60 * 1000;
  if (value.endsWith("m")) return Number(value.slice(0, -1)) * 60 * 1000;
  if (value.endsWith("s")) return Number(value.slice(0, -1)) * 1000;
  return 15 * 60 * 1000;
}

const cookieBase = () => ({
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: config.cookieSameSite,
});

export function setAuthCookies(res: Response, tokens: TokenPair): void {
  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...cookieBase(),
    path: "/api",
    maxAge: parseDurationToMs(config.jwtAccessExpiresIn),
  });

  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...cookieBase(),
    path: "/api/auth",
    maxAge: parseDurationToMs(config.jwtRefreshExpiresIn),
  });
}

export function clearAuthCookies(res: Response): void {
  const base = cookieBase();
  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...base, path: "/api" });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...base, path: "/api/auth" });
}

export function getAccessTokenFromRequest(req: Request): string | undefined {
  const cookieToken = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (cookieToken) return cookieToken;

  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice(7);
  }

  return undefined;
}

export function getRefreshTokenFromRequest(req: Request): string | undefined {
  const cookieToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (cookieToken) return cookieToken;

  const bodyToken = req.body?.refreshToken;
  if (typeof bodyToken === "string") return bodyToken;

  return undefined;
}
