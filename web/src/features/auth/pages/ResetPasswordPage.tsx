import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useResetPassword } from "@/features/auth/hooks/useAuth";
import { ApiError } from "@/lib/api-client";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const resetPassword = useResetPassword();

  const error =
    resetPassword.error instanceof ApiError
      ? resetPassword.error.message
      : resetPassword.error?.message;

  if (!token) {
    return (
      <Card title="Invalid link" description="This password reset link is missing a token.">
        <Link to="/forgot-password" className="text-sm text-brand-600 dark:text-brand-400">
          Request a new reset link
        </Link>
      </Card>
    );
  }

  return (
    <Card title="Set new password" description="Choose a strong password for your account">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          resetPassword.mutate({ token, password });
        }}
      >
        {error && <Alert variant="error">{error}</Alert>}
        {resetPassword.isSuccess && (
          <Alert variant="success">Password updated. Redirecting to sign in...</Alert>
        )}

        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Button type="submit" className="w-full" loading={resetPassword.isPending}>
          Update password
        </Button>
      </form>
    </Card>
  );
}
