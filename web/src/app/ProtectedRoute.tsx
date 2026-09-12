import { Navigate, Outlet, useLocation } from "react-router-dom";
import { PageLoader } from "@/components/ui/Loader";
import { useSession } from "@/features/auth/hooks/useAuth";

export function ProtectedRoute() {
  const location = useLocation();
  const { data: user, isPending, isError } = useSession();

  if (isPending) {
    return <PageLoader label="Loading session..." />;
  }

  if (isError || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
