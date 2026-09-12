import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { PageLoader } from "@/components/ui/Loader";
import { useOAuthExchange } from "@/features/auth/hooks/useAuth";
import { ApiError } from "@/lib/api-client";

export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");
  const { mutate, isError, error } = useOAuthExchange();
  const exchanged = useRef(false);

  useEffect(() => {
    if (code && !exchanged.current) {
      exchanged.current = true;
      mutate({ code });
    }
  }, [code, mutate]);

  if (errorParam) {
    return (
      <Card title="Sign in failed">
        <Alert variant="error">{errorParam}</Alert>
      </Card>
    );
  }

  if (!code) {
    return (
      <Card title="Invalid callback">
        <Alert variant="error">Missing authorization code.</Alert>
      </Card>
    );
  }

  if (isError) {
    const message =
      error instanceof ApiError ? error.message : error?.message ?? "OAuth sign-in failed";

    return (
      <Card title="Sign in failed">
        <Alert variant="error">{message}</Alert>
      </Card>
    );
  }

  return <PageLoader label="Completing sign in..." />;
}
