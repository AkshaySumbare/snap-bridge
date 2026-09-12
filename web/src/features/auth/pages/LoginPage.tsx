import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useLogin } from "@/features/auth/hooks/useAuth";
import { GoogleSignInButton } from "@/features/auth/components/GoogleSignInButton";
import { AuthDivider } from "@/features/auth/components/AuthDivider";
import { ApiError } from "@/lib/api-client";

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();

  const oauthError = searchParams.get("error");
  const loginError =
    login.error instanceof ApiError ? login.error.message : login.error?.message;
  const error = loginError ?? (oauthError ? `Google sign-in failed: ${oauthError}` : null);

  return (
    <Card title="Welcome back" description="Sign in to your SnapBridge account">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate({ email, password });
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

        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div className="flex justify-end">
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" className="w-full" loading={login.isPending}>
          Sign in
        </Button>
      </form>

      <AuthDivider />
      <GoogleSignInButton />

      <p className="mt-6 text-center text-sm text-[var(--color-text-muted)]">
        Don&apos;t have an account?{" "}
        <Link
          to="/register"
          className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
        >
          Create one
        </Link>
      </p>
    </Card>
  );
}
