import { Navigate, Outlet } from "react-router-dom";
import { useSession } from "@/features/auth/hooks/useAuth";

export function VerifiedRoute() {
  const { data: user } = useSession();

  if (user && !user.isVerified) {
    return <Navigate to="/verify-email" replace />;
  }

  return <Outlet />;
}
