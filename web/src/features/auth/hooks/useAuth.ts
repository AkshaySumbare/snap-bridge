import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { authApi } from "@/features/auth/api/auth.api";
import { useAuthStore } from "@/stores/auth.store";
import type {
  ForgotPasswordPayload,
  LoginPayload,
  OAuthExchangePayload,
  RegisterPayload,
  ResetPasswordPayload,
} from "@/features/auth/types/auth.types";

export function useMe() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => authApi.me(),
    enabled: isAuthenticated,
    select: (data) => data.user,
  });
}

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: LoginPayload) => authApi.login(payload),
    onSuccess: (data) => {
      setSession(data);
      queryClient.setQueryData(["auth", "me"], { user: data.user });
      navigate("/dashboard", { replace: true });
    },
  });
}

export function useRegister() {
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: RegisterPayload) => authApi.register(payload),
    onSuccess: (data) => {
      setSession(data);
      queryClient.setQueryData(["auth", "me"], { user: data.user });
      navigate("/dashboard", { replace: true });
    },
  });
}

export function useLogout() {
  const { refreshToken, clearSession } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (refreshToken) {
        await authApi.logout(refreshToken).catch(() => undefined);
      }
    },
    onSettled: () => {
      clearSession();
      queryClient.clear();
      navigate("/login", { replace: true });
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (payload: ForgotPasswordPayload) => authApi.forgotPassword(payload),
  });
}

export function useResetPassword() {
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (payload: ResetPasswordPayload) => authApi.resetPassword(payload),
    onSuccess: () => {
      navigate("/login", { replace: true });
    },
  });
}

export function useOAuthExchange() {
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: OAuthExchangePayload) => authApi.exchangeOAuthCode(payload),
    onSuccess: (data) => {
      setSession(data);
      queryClient.setQueryData(["auth", "me"], { user: data.user });
      navigate("/dashboard", { replace: true });
    },
  });
}
