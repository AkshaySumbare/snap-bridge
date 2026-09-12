import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { authApi } from "@/features/auth/api/auth.api";
import { useAuthStore } from "@/stores/auth.store";
import type {
  ForgotPasswordPayload,
  LoginPayload,
  RegisterPayload,
  ResetPasswordPayload,
} from "@/features/auth/types/auth.types";

export function useSession() {
  const setUser = useAuthStore((s) => s.setUser);

  return useQuery({
    queryKey: ["auth", "session"],
    queryFn: async () => {
      const data = await authApi.me();
      setUser(data.user);
      return data.user;
    },
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useMe() {
  const { data: user, ...rest } = useSession();
  return { data: user, ...rest };
}

export function useLogin() {
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: LoginPayload) => authApi.login(payload),
    onSuccess: (data) => {
      setUser(data.user);
      queryClient.setQueryData(["auth", "session"], data.user);
      navigate("/dashboard", { replace: true });
    },
  });
}

export function useRegister() {
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: RegisterPayload) => authApi.register(payload),
    onSuccess: (data) => {
      setUser(data.user);
      queryClient.setQueryData(["auth", "session"], data.user);
      navigate("/dashboard", { replace: true });
    },
  });
}

export function useLogout() {
  const clearUser = useAuthStore((s) => s.clearUser);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      clearUser();
      queryClient.removeQueries({ queryKey: ["auth"] });
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
