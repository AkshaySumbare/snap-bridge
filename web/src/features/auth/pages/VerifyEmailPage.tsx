import { Navigate } from "react-router-dom";
import { VerifyEmailModal } from "@/features/auth/components/VerifyEmailModal";
import { useSession } from "@/features/auth/hooks/useAuth";

export function VerifyEmailPage() {
  const { data: user } = useSession();

  if (user?.isVerified) {
    return <Navigate to="/dashboard" replace />;
  }

  return <VerifyEmailModal />;
}
