import { useEffect, useRef, useState } from "react";
import { Camera, LogOut, Moon, Sun, Trash2 } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { useLogout } from "@/features/auth/hooks/useAuth";
import { useDeleteAvatar, useUploadAvatar } from "@/features/profile/hooks/useProfile";
import { useThemeStore } from "@/stores/theme.store";
import { UserAvatar } from "./UserAvatar";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api-client";

export function ProfileMenu() {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();
  const uploadAvatar = useUploadAvatar();
  const deleteAvatar = useDeleteAvatar();
  const { theme, setTheme } = useThemeStore();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const avatarError =
    uploadAvatar.error instanceof ApiError
      ? uploadAvatar.error.message
      : deleteAvatar.error instanceof ApiError
        ? deleteAvatar.error.message
        : null;

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    uploadAvatar.mutate(file);
    event.target.value = "";
  }

  if (!user) return null;

  const isAvatarBusy = uploadAvatar.isPending || deleteAvatar.isPending;

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={isAvatarBusy}
        className={cn(
          "rounded-full transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
          open && "ring-2 ring-brand-500/30 ring-offset-2",
          isAvatarBusy && "opacity-60",
        )}
        aria-label="Open profile menu"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <UserAvatar
          name={user.name}
          email={user.email}
          avatarUrl={user.avatarUrl}
          size="sm"
        />
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
      />

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-72 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg shadow-black/10"
          role="menu"
        >
          <div className="flex flex-col items-center border-b border-[var(--color-border)] px-4 py-4">
            <UserAvatar
              name={user.name}
              email={user.email}
              avatarUrl={user.avatarUrl}
              size="lg"
            />
            <p className="mt-3 truncate text-sm font-semibold text-[var(--color-text)]">
              {user.name || "SnapBridge user"}
            </p>
            <p className="truncate text-xs text-[var(--color-text-muted)]">{user.email}</p>
            {avatarError && (
              <p className="mt-2 text-center text-xs text-red-500">{avatarError}</p>
            )}
          </div>

          <div className="p-1.5">
            <button
              type="button"
              role="menuitem"
              disabled={isAvatarBusy}
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-muted)] disabled:opacity-50"
            >
              <Camera className="h-4 w-4" />
              {user.avatarUrl ? "Replace photo" : "Add photo"}
            </button>

            {user.avatarUrl && (
              <button
                type="button"
                role="menuitem"
                disabled={isAvatarBusy}
                onClick={() => deleteAvatar.mutate()}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-4 w-4" />
                Remove photo
              </button>
            )}

            <button
              type="button"
              role="menuitem"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-muted)]"
            >
              <span className="flex items-center gap-2">
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                Theme
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {isDark ? "Dark" : "Light"}
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              disabled={logout.isPending}
              onClick={() => {
                setOpen(false);
                logout.mutate();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
