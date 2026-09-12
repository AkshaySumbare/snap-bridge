import { Resend } from "resend";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!config.resendApiKey) {
    throw new AppError(500, "Email service is not configured");
  }

  if (!resendClient) {
    resendClient = new Resend(config.resendApiKey);
  }

  return resendClient;
}

export function isEmailConfigured(): boolean {
  return Boolean(config.resendApiKey);
}

async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
}): Promise<void> {
  if (!isEmailConfigured()) {
    if (config.isDev) {
      console.log(`[email:dev] To: ${params.to} | Subject: ${params.subject}`);
      console.log(`[email:dev] ${params.text}`);
      return;
    }
    throw new AppError(500, "Email service is not configured");
  }

  const resend = getResend();
  const { data, error } = await resend.emails.send(
    {
      from: config.resendFromEmail,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
    },
    params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined,
  );

  if (error) {
    console.error("[email] Resend error:", error);
    throw new AppError(500, "Failed to send email");
  }

  if (config.isDev) {
    console.log(`[email] Sent ${params.subject} to ${params.to} (id: ${data?.id})`);
  }
}

export async function sendVerificationOtpEmail(
  email: string,
  name: string | null,
  code: string,
): Promise<void> {
  const greeting = name ? `Hi ${name}` : "Hi there";

  await sendEmail({
    to: email,
    subject: "Verify your SnapBridge account",
    text: `${greeting},\n\nYour SnapBridge verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't create an account, you can ignore this email.`,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #4f46e5; margin-bottom: 8px;">SnapBridge</h2>
        <p>${greeting},</p>
        <p>Use this code to verify your email address:</p>
        <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #0f172a; margin: 24px 0;">${code}</p>
        <p style="color: #64748b; font-size: 14px;">This code expires in 10 minutes.</p>
        <p style="color: #64748b; font-size: 14px;">If you didn't create an account, you can ignore this email.</p>
      </div>
    `,
    idempotencyKey: `verify-otp/${email}/${code}`,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string,
): Promise<void> {
  await sendEmail({
    to: email,
    subject: "Reset your SnapBridge password",
    text: `Reset your password by visiting this link (expires in 1 hour):\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #4f46e5; margin-bottom: 8px;">SnapBridge</h2>
        <p>You requested a password reset. Click the button below to set a new password:</p>
        <a href="${resetUrl}" style="display: inline-block; background: #4f46e5; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">
          Reset password
        </a>
        <p style="color: #64748b; font-size: 14px;">This link expires in 1 hour.</p>
        <p style="color: #64748b; font-size: 14px; word-break: break-all;">Or copy this URL: ${resetUrl}</p>
        <p style="color: #64748b; font-size: 14px;">If you didn't request this, you can ignore this email.</p>
      </div>
    `,
    idempotencyKey: `password-reset/${email}/${resetUrl}`,
  });
}
