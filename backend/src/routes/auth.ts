import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { authRateLimiter } from "../middleware/rateLimit.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import {
  registerSchema,
  loginSchema,
  googleLoginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  oauthExchangeSchema,
} from "../validators/auth.validator.js";
import * as authService from "../services/auth.service.js";
import * as googleOAuthService from "../services/google-oauth.service.js";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";
import {
  setAuthCookies,
  clearAuthCookies,
  getRefreshTokenFromRequest,
} from "../utils/cookies.js";

const router = Router();

function sendWebAuth(res: Parameters<typeof setAuthCookies>[0], result: Awaited<ReturnType<typeof authService.loginLocal>>, status = 200) {
  setAuthCookies(res, result.tokens);
  res.status(status).json({ user: result.user });
}

function sendMobileAuth(res: Parameters<typeof setAuthCookies>[0], result: Awaited<ReturnType<typeof authService.loginLocal>>) {
  res.json({
    user: result.user,
    accessToken: result.tokens.accessToken,
    refreshToken: result.tokens.refreshToken,
    expiresIn: result.tokens.expiresIn,
    token: result.tokens.accessToken,
  });
}

router.post(
  "/register",
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const result = await authService.registerLocal(
      parsed.data.email,
      parsed.data.password,
      parsed.data.name,
    );
    sendWebAuth(res, result, 201);
  }),
);

router.post(
  "/signup",
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const result = await authService.registerLocal(
      parsed.data.email,
      parsed.data.password,
      parsed.data.name,
    );
    sendWebAuth(res, result, 201);
  }),
);

router.post(
  "/login",
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const result = await authService.loginLocal(parsed.data.email, parsed.data.password);
    sendWebAuth(res, result);
  }),
);

router.get(
  "/google",
  authRateLimiter,
  asyncHandler(async (_req, res) => {
    const url = await googleOAuthService.getGoogleRedirectUrl();
    res.redirect(url);
  }),
);

router.get(
  "/google/callback",
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const googleError = typeof req.query.error === "string" ? req.query.error : "";

    if (googleError) {
      res.redirect(googleOAuthService.getOAuthErrorRedirectUrl(googleError));
      return;
    }

    if (!code || !state) {
      res.redirect(googleOAuthService.getOAuthErrorRedirectUrl("missing_code_or_state"));
      return;
    }

    try {
      const result = await googleOAuthService.completeGoogleCallback(code, state);
      setAuthCookies(res, result.tokens);
      res.redirect(config.googleOAuthSuccessRedirect);
    } catch (err) {
      const message = err instanceof AppError ? err.message : "oauth_failed";
      res.redirect(googleOAuthService.getOAuthErrorRedirectUrl(message));
    }
  }),
);

router.post(
  "/oauth/exchange",
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const parsed = oauthExchangeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const result = await googleOAuthService.exchangeOAuthCode(parsed.data.code);
    sendWebAuth(res, result);
  }),
);

router.post(
  "/google/token",
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const parsed = googleLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const result = await authService.loginWithGoogle(parsed.data.idToken);
    sendMobileAuth(res, result);
  }),
);

router.post(
  "/refresh",
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const refreshToken = getRefreshTokenFromRequest(req);

    if (!refreshToken) {
      res.status(401).json({ error: "Refresh token required" });
      return;
    }

    const result = await authService.refreshSession(refreshToken);
    sendWebAuth(res, result);
  }),
);

router.post(
  "/logout",
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const refreshToken = getRefreshTokenFromRequest(req);

    if (refreshToken) {
      await authService.logout(refreshToken);
    }

    clearAuthCookies(res);
    res.json({ message: "Logged out successfully" });
  }),
);

router.post(
  "/logout-all",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { auth } = req as AuthedRequest;
    await authService.logoutAll(auth.userId);
    clearAuthCookies(res);
    res.json({ message: "Logged out from all devices" });
  }),
);

router.post(
  "/forgot-password",
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { resetToken } = await authService.forgotPassword(parsed.data.email);
    const response: Record<string, string> = {
      message: "If an account with that email exists, password reset instructions have been sent.",
    };

    if (config.isDev && resetToken) {
      response.resetToken = resetToken;
    }

    res.json(response);
  }),
);

router.post(
  "/reset-password",
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    await authService.resetPassword(parsed.data.token, parsed.data.password);
    clearAuthCookies(res);
    res.json({ message: "Password reset successful. Please log in again." });
  }),
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { auth } = req as AuthedRequest;
    const user = await authService.getUserById(auth.userId);
    res.json({ user });
  }),
);

export default router;
