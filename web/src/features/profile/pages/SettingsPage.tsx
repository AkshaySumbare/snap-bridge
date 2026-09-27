import { useState } from "react";
import { Settings } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/Loader";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { useAuthStore } from "@/stores/auth.store";
import { useMe } from "@/features/auth/hooks/useAuth";
import { useDeleteAccount } from "@/features/profile/hooks/useProfile";
import { DeleteAccountDialog } from "@/features/profile/components/DeleteAccountDialog";

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const { isLoading } = useMe();
  const deleteAccount = useDeleteAccount();
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading && !user) {
    return <PageLoader label="Loading settings…" />;
  }

  if (!user) return null;

  const displayName = user.name || user.email.split("@")[0];

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]">
          <Settings className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Settings</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Account and preferences</p>
        </div>
      </div>

      <Card className="space-y-4 p-6">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Account</h2>
        <div className="flex items-center gap-4">
          <UserAvatar
            name={user.name}
            email={user.email}
            avatarUrl={user.avatarUrl}
            size="md"
          />
          <div className="min-w-0">
            <p className="font-medium text-[var(--color-text)]">{displayName}</p>
            <p className="truncate text-sm text-[var(--color-text-muted)]">{user.email}</p>
            <p className="mt-0.5 text-xs capitalize text-[var(--color-text-muted)]">
              {user.authProvider === "google" ? "Google sign-in" : "Email and password"}
            </p>
          </div>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          Profile photo and theme are in the account menu at the bottom of the sidebar.
        </p>
      </Card>

      <Card className="space-y-3 border-red-200/80 p-6 dark:border-red-900/50">
        <h2 className="text-sm font-semibold text-red-600 dark:text-red-400">Danger zone</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Permanently delete your SnapBridge account and all associated data.
        </p>
        <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
          Delete account
        </Button>
      </Card>

      <DeleteAccountDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deleteAccount.isPending) setDeleteOpen(open);
        }}
        email={user.email}
        requiresPassword={user.authProvider === "local"}
        pending={deleteAccount.isPending}
        error={deleteAccount.isError ? deleteAccount.error : undefined}
        onConfirm={(password) => {
          deleteAccount.mutate(
            { password },
            {
              onSuccess: () => setDeleteOpen(false),
            },
          );
        }}
      />
    </div>
  );
}
