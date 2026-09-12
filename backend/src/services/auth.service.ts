import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { config } from "../config.js";
import { User, toPublicUser } from "../models/User.js";
import { AppError } from "../utils/errors.js";
import {
  issueTokenPair,
  rotateRefreshToken,
  revokeAllUserTokens,
  revokeRefreshToken,
  createPasswordResetToken,
  consumePasswordResetToken,
  type TokenPair,
} from "./token.service.js";

const googleClient = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;
const BCRYPT_ROUNDS = 12;

export interface GoogleProfile {
  googleId: string;
  email: string;
  name?: string;
}

export async function findOrCreateGoogleUser(profile: GoogleProfile) {
  const email = profile.email.toLowerCase();
  let user = await User.findOne({ $or: [{ googleId: profile.googleId }, { email }] });

  if (!user) {
    user = await User.create({
      email,
      name: profile.name,
      googleId: profile.googleId,
      authProvider: "google",
    });
  } else if (!user.googleId) {
    user.googleId = profile.googleId;
    user.name = user.name ?? profile.name;
    await user.save();
  }

  return user;
}

export interface AuthResult {
  user: ReturnType<typeof toPublicUser>;
  tokens: TokenPair;
}

async function buildAuthResult(user: InstanceType<typeof User>): Promise<AuthResult> {
  const tokens = await issueTokenPair(user._id.toString(), user.email);
  return { user: toPublicUser(user), tokens };
}

export async function registerLocal(
  email: string,
  password: string,
  name?: string,
): Promise<AuthResult> {
  const normalizedEmail = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw new AppError(409, "Email already registered");
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await User.create({
    email: normalizedEmail,
    passwordHash,
    name: name?.trim(),
    authProvider: "local",
  });

  return buildAuthResult(user);
}

export async function loginLocal(email: string, password: string): Promise<AuthResult> {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });
  

  if (!user?.passwordHash) {
    throw new AppError(401, "Invalid email or password");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid email or password");
  }

  return buildAuthResult(user);
}

export async function loginWithGoogle(idToken: string): Promise<AuthResult> {
  if (!googleClient || !config.googleClientId) {
    throw new AppError(500, "Google login is not configured");
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: config.googleClientId,
  });

  const payload = ticket.getPayload();
  if (!payload?.email || !payload.sub) {
    throw new AppError(401, "Invalid Google token");
  }

  const user = await findOrCreateGoogleUser({
    googleId: payload.sub,
    email: payload.email,
    name: payload.name,
  });

  return buildAuthResult(user);
}

export async function refreshSession(refreshToken: string): Promise<AuthResult> {
  const { userId, tokens } = await rotateRefreshToken(refreshToken);
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(401, "User not found");
  }
  return { user: toPublicUser(user), tokens };
}

export async function logout(refreshToken: string): Promise<void> {
  await revokeRefreshToken(refreshToken);
}

export async function logoutAll(userId: string): Promise<void> {
  await revokeAllUserTokens(userId);
}

export async function forgotPassword(email: string): Promise<{ resetToken?: string }> {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  // Always return success to avoid email enumeration
  if (!user || !user.passwordHash) {
    return {};
  }

  const resetToken = await createPasswordResetToken(user._id.toString());
  return config.isDev ? { resetToken } : {};
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const userId = await consumePasswordResetToken(token);
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(400, "Invalid or expired reset token");
  }

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await user.save();
  await revokeAllUserTokens(userId);
}

export async function getUserById(userId: string) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, "User not found");
  }
  return toPublicUser(user);
}
