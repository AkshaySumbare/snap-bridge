import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/stores/auth.store";
import { PageLoader } from "@/components/ui/Loader";
import { useStoreHydration } from "@/hooks/useStoreHydration";

export function GuestRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const hasHydrated = useStoreHydration(useAuthStore);

  if (!hasHydrated) {
    return <PageLoader label="Loading..." />;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
