import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/auth.store";
import { PageLoader } from "@/components/ui/Loader";
import { useStoreHydration } from "@/hooks/useStoreHydration";

export function ProtectedRoute() {
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const hasHydrated = useStoreHydration(useAuthStore);

  if (!hasHydrated) {
    return <PageLoader label="Loading session..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
