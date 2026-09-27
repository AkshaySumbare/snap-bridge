import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { profileApi } from "@/features/profile/api/profile.api";
import { useAuthStore } from "@/stores/auth.store";
import type { User } from "@/features/auth/types/auth.types";

function syncUser(user: User) {
  useAuthStore.getState().setUser(user);
}

export function useUploadAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => profileApi.uploadAvatar(file),
    onSuccess: (data) => {
      syncUser(data.user);
      queryClient.setQueryData(["auth", "session"], data.user);
    },
  });
}

export function useDeleteAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => profileApi.deleteAvatar(),
    onSuccess: (data) => {
      syncUser(data.user);
      queryClient.setQueryData(["auth", "session"], data.user);
    },
  });
}

export function useDeleteAccount() {
  const clearUser = useAuthStore((s) => s.clearUser);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { password?: string }) =>
      profileApi.deleteAccount({
        confirm: true,
        password: input.password,
      }),
    onSuccess: () => {
      clearUser();
      queryClient.clear();
      navigate("/login", { replace: true });
    },
  });
}
