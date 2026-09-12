import { randomUUID } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { config } from "../config.js";
import { getRedis } from "../db/redis.js";
import { AppError } from "../utils/errors.js";
import { toPublicUser } from "../models/User.js";
import { findOrCreateGoogleUser, type AuthResult } from "./auth.service.js";
import { issueTokenPair } from "./token.service.js";

const OAUTH_STATE_PREFIX = "oauth-state:";
const OAUTH_EXCHANGE_PREFIX = "oauth-exchange:";
const STATE_TTL_SECONDS = 600;
const EXCHANGE_TTL_SECONDS = 60;

function getOAuthClient(): OAuth2Client {
  if (!config.googleClientId || !config.googleClientSecret || !config.googleRedirectUri) {
    throw new AppError(500, "Google OAuth is not configured");
  }

  return new OAuth2Client(
    config.googleClientId,
    config.googleClientSecret,
    config.googleRedirectUri,
  );
}

export async function getGoogleRedirectUrl(): Promise<string> {
  const state = randomUUID();
  const redis = getRedis();
  await redis.setEx(`${OAUTH_STATE_PREFIX}${state}`, STATE_TTL_SECONDS, "1");

  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account",
  });
}

export async function handleGoogleCallback(code: string, state: string): Promise<string> {
  const redis = getRedis();
  const stateKey = `${OAUTH_STATE_PREFIX}${state}`;
  const stateValid = await redis.get(stateKey);

  if (!stateValid) {
    throw new AppError(400, "Invalid or expired OAuth state");
  }

  await redis.del(stateKey);

  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.id_token) {
    throw new AppError(401, "Google did not return an ID token");
  }

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: config.googleClientId,
  });

  const payload = ticket.getPayload();
  if (!payload?.email || !payload.sub) {
    throw new AppError(401, "Invalid Google account data");
  }

  const user = await findOrCreateGoogleUser({
    googleId: payload.sub,
    email: payload.email,
    name: payload.name,
  });

  const tokenPair = await issueTokenPair(user._id.toString(), user.email);
  const exchangeCode = randomUUID();

  const exchangePayload: AuthResult = {
    user: toPublicUser(user),
    tokens: tokenPair,
  };

  await redis.setEx(
    `${OAUTH_EXCHANGE_PREFIX}${exchangeCode}`,
    EXCHANGE_TTL_SECONDS,
    JSON.stringify(exchangePayload),
  );

  return exchangeCode;
}

export async function exchangeOAuthCode(code: string): Promise<AuthResult> {
  const redis = getRedis();
  const key = `${OAUTH_EXCHANGE_PREFIX}${code}`;
  const raw = await redis.get(key);

  if (!raw) {
    throw new AppError(400, "Invalid or expired OAuth exchange code");
  }

  await redis.del(key);
  return JSON.parse(raw) as AuthResult;
}

export function getOAuthSuccessRedirectUrl(exchangeCode: string): string {
  const base = config.googleOAuthSuccessRedirect;
  const url = new URL(base);
  url.searchParams.set("code", exchangeCode);
  return url.toString();
}

export function getOAuthErrorRedirectUrl(error: string): string {
  const base = config.googleOAuthSuccessRedirect;
  const url = new URL(base);
  url.searchParams.set("error", error);
  return url.toString();
}
