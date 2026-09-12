import { useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useForgotPassword } from "@/features/auth/hooks/useAuth";
import { ApiError } from "@/lib/api-client";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const forgotPassword = useForgotPassword();

  const error =
    forgotPassword.error instanceof ApiError
      ? forgotPassword.error.message
      : forgotPassword.error?.message;

  return (
    <Card
      title="Reset password"
      description="Enter your email and we'll send reset instructions"
    >
      {forgotPassword.isSuccess ? (
        <div className="space-y-4">
          <Alert variant="success">
            If an account exists for that email, reset instructions have been sent.
          </Alert>
          <Link to="/login" className="block text-center text-sm text-brand-600 dark:text-brand-400">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            forgotPassword.mutate({ email });
          }}
        >
          {error && <Alert variant="error">{error}</Alert>}

          <Input
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <Button type="submit" className="w-full" loading={forgotPassword.isPending}>
            Send reset link
          </Button>

          <Link
            to="/login"
            className="block text-center text-sm text-[var(--color-text-muted)] hover:text-brand-600"
          >
            Back to sign in
          </Link>
        </form>
      )}
    </Card>
  );
}
