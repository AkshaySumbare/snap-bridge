import { randomInt } from "node:crypto";
import { getRedis } from "../db/redis.js";
import { AppError } from "../utils/errors.js";
import { sendVerificationOtpEmail } from "./email.service.js";

const OTP_PREFIX = "email-otp:";
const OTP_RESEND_PREFIX = "email-otp-resend:";
const OTP_TTL_SECONDS = 600;
const RESEND_COOLDOWN_SECONDS = 60;

function generateOtp(): string {
  return randomInt(100000, 1000000).toString();
}

export async function createAndSendEmailOtp(
  userId: string,
  email: string,
  name: string | null,
): Promise<void> {
  const redis = getRedis();
  const code = generateOtp();

  await redis.setEx(`${OTP_PREFIX}${userId}`, OTP_TTL_SECONDS, code);
  await redis.setEx(`${OTP_RESEND_PREFIX}${userId}`, RESEND_COOLDOWN_SECONDS, "1");

  await sendVerificationOtpEmail(email, name, code);
}

export async function resendEmailOtp(
  userId: string,
  email: string,
  name: string | null,
): Promise<void> {
  const redis = getRedis();
  const cooldown = await redis.get(`${OTP_RESEND_PREFIX}${userId}`);

  if (cooldown) {
    throw new AppError(429, "Please wait before requesting another code");
  }

  await createAndSendEmailOtp(userId, email, name);
}

export async function verifyEmailOtp(userId: string, code: string): Promise<boolean> {
  const redis = getRedis();
  const key = `${OTP_PREFIX}${userId}`;
  const stored = await redis.get(key);

  if (!stored) {
    throw new AppError(400, "Verification code expired. Please request a new one.");
  }

  if (stored !== code) {
    throw new AppError(400, "Invalid verification code");
  }

  await redis.del(key);
  return true;
}
