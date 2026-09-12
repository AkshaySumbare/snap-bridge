import { useState } from "react";
import { Mail } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useResendVerification, useVerifyEmail } from "@/features/auth/hooks/useAuth";
import { useAuthStore } from "@/stores/auth.store";
import { ApiError } from "@/lib/api-client";

export function VerifyEmailModal() {
  const user = useAuthStore((s) => s.user);
  const [code, setCode] = useState("");
  const verifyEmail = useVerifyEmail();
  const resendVerification = useResendVerification();

  const verifyError =
    verifyEmail.error instanceof ApiError
      ? verifyEmail.error.message
      : verifyEmail.error?.message;

  const resendError =
    resendVerification.error instanceof ApiError
      ? resendVerification.error.message
      : resendVerification.error?.message;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-bg)]/90 px-4 backdrop-blur-sm">
      <Card
        className="w-full max-w-md shadow-xl"
        title="Verify your email"
        description={`Enter the 6-digit code sent to ${user?.email ?? "your email"}`}
      >
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
            <Mail className="h-7 w-7" />
          </div>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            verifyEmail.mutate({ code });
          }}
        >
          {verifyError && <Alert variant="error">{verifyError}</Alert>}
          {resendVerification.isSuccess && (
            <Alert variant="success">A new verification code has been sent.</Alert>
          )}
          {resendError && <Alert variant="error">{resendError}</Alert>}

          <Input
            label="Verification code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            placeholder="000000"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="text-center text-lg tracking-[0.4em]"
          />

          <Button
            type="submit"
            className="w-full"
            loading={verifyEmail.isPending}
            disabled={code.length !== 6}
          >
            Verify email
          </Button>
        </form>

        <div className="mt-4 text-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={resendVerification.isPending}
            onClick={() => resendVerification.mutate()}
          >
            Resend code
          </Button>
        </div>
      </Card>
    </div>
  );
}
