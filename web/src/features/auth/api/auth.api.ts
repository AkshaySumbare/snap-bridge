import { apiFetch } from "@/lib/api-client";
import type {
  AuthResponse,
  ForgotPasswordPayload,
  ForgotPasswordResponse,
  LoginPayload,
  RegisterPayload,
  ResetPasswordPayload,
  User,
} from "@/features/auth/types/auth.types";

export const authApi = {
  login: (payload: LoginPayload) =>
    apiFetch<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  register: (payload: RegisterPayload) =>
    apiFetch<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  me: () => apiFetch<{ user: User }>("/auth/me"),

  logout: () =>
    apiFetch<{ message: string }>("/auth/logout", {
      method: "POST",
    }),

  logoutAll: () =>
    apiFetch<{ message: string }>("/auth/logout-all", {
      method: "POST",
    }),

  forgotPassword: (payload: ForgotPasswordPayload) =>
    apiFetch<ForgotPasswordResponse>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  resetPassword: (payload: ResetPasswordPayload) =>
    apiFetch<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  googleAuthUrl: () => "/api/auth/google",
};
