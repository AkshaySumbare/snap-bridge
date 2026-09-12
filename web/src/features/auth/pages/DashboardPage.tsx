import { Camera, Cloud, Shield } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageLoader } from "@/components/ui/Loader";
import { useAuthStore } from "@/stores/auth.store";
import { useMe } from "@/features/auth/hooks/useAuth";

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { isLoading } = useMe();

  if (isLoading && !user) {
    return <PageLoader label="Loading your account..." />;
  }

  const displayName = user?.name || user?.email?.split("@")[0] || "there";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text)]">
          Welcome, {displayName}
        </h1>
        <p className="mt-2 text-[var(--color-text-muted)]">
          Your SnapBridge account is ready. Capture sync features are coming soon.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="flex flex-col items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
            <Camera className="h-5 w-5" />
          </div>
          <h3 className="font-semibold text-[var(--color-text)]">Capture</h3>
          <p className="text-sm text-[var(--color-text-muted)]">
            Screenshots and clips from your devices, synced in real time.
          </p>
        </Card>

        <Card className="flex flex-col items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
            <Cloud className="h-5 w-5" />
          </div>
          <h3 className="font-semibold text-[var(--color-text)]">Sync</h3>
          <p className="text-sm text-[var(--color-text-muted)]">
            Access your captures from any connected device, anywhere.
          </p>
        </Card>

        <Card className="flex flex-col items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
            <Shield className="h-5 w-5" />
          </div>
          <h3 className="font-semibold text-[var(--color-text)]">Secure</h3>
          <p className="text-sm text-[var(--color-text-muted)]">
            Signed in via {user?.authProvider === "google" ? "Google" : "email"} with JWT auth.
          </p>
        </Card>
      </div>

      <Card title="Account details">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              Email
            </dt>
            <dd className="mt-1 text-sm text-[var(--color-text)]">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              Provider
            </dt>
            <dd className="mt-1 text-sm capitalize text-[var(--color-text)]">
              {user?.authProvider}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
