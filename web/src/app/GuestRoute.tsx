import { Navigate, Outlet } from "react-router-dom";
import { PageLoader } from "@/components/ui/Loader";
import { useSession } from "@/features/auth/hooks/useAuth";

export function GuestRoute() {
  const { data: user, isPending } = useSession();

  if (isPending) {
    return <PageLoader label="Loading..." />;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
