import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

export interface FirmUser {
  id: string;
  email: string;
  name?: string | null;
  firstName?: string;
  lastName?: string;
  displayName?: string;
}

export function useFirmUsers(enabled: boolean) {
  return useQuery({
    queryKey: ["presenter", "users"],
    enabled,
    queryFn: () => api.get<FirmUser[]>("/presenter/users", { searchParams: { q: "" } }),
  });
}
