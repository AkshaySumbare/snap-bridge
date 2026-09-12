import { useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useRegister } from "@/features/auth/hooks/useAuth";
import { GoogleSignInButton } from "@/features/auth/components/GoogleSignInButton";
import { AuthDivider } from "@/features/auth/components/AuthDivider";
import { ApiError } from "@/lib/api-client";

export function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const register = useRegister();

  const error =
    register.error instanceof ApiError ? register.error.message : register.error?.message;

  return (
    <Card title="Create account" description="Start syncing captures with SnapBridge">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          register.mutate({ email, password, name: name || undefined });
        }}
      >
        {error && <Alert variant="error">{error}</Alert>}

        <Input
          label="Name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

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
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Button type="submit" className="w-full" loading={register.isPending}>
          Create account
        </Button>
      </form>

      <AuthDivider />
      <GoogleSignInButton />

      <p className="mt-6 text-center text-sm text-[var(--color-text-muted)]">
        Already have an account?{" "}
        <Link
          to="/login"
          className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
        >
          Sign in
        </Link>
      </p>
    </Card>
  );
}
