export interface User {
  id: string;
  email: string;
  name: string | null;
  authProvider: "local" | "google";
  createdAt: string;
}

export interface AuthResponse {
  user: User;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  name?: string;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
  resetToken?: string;
}

export interface ResetPasswordPayload {
  token: string;
  password: string;
}
