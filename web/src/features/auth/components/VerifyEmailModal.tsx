import { useState } from "react";
import { Mail } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { OtpInput } from "@/components/ui/OtpInput";
import { useResendVerification, useVerifyEmail } from "@/features/auth/hooks/useAuth";
import { useAuthStore } from "@/stores/auth.store";
import { useCountdown } from "@/hooks/useCountdown";
import { ApiError } from "@/lib/api-client";

const RESEND_COOLDOWN_SECONDS = 60;

export function VerifyEmailModal() {
  const user = useAuthStore((s) => s.user);
  const [code, setCode] = useState("");
  const verifyEmail = useVerifyEmail();
  const resendVerification = useResendVerification();
  const { remaining, isActive, reset } = useCountdown(RESEND_COOLDOWN_SECONDS);

  const verifyError =
    verifyEmail.error instanceof ApiError
      ? verifyEmail.error.message
      : verifyEmail.error?.message;

  const resendError =
    resendVerification.error instanceof ApiError
      ? resendVerification.error.message
      : resendVerification.error?.message;

  function handleResend() {
    resendVerification.mutate(undefined, {
      onSuccess: () => {
        reset(RESEND_COOLDOWN_SECONDS);
        setCode("");
      },
    });
  }

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
          className="space-y-6"
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

          <div className="space-y-2">
            <p className="text-center text-sm font-medium text-[var(--color-text-muted)]">
              Verification code
            </p>
            <OtpInput
              value={code}
              onChange={setCode}
              disabled={verifyEmail.isPending}
              autoFocus
            />
          </div>

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
            disabled={isActive || resendVerification.isPending}
            onClick={handleResend}
          >
            {isActive ? `Resend code in ${remaining}s` : "Resend code"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
