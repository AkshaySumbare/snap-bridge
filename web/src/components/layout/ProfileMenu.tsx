import { useEffect, useRef, useState } from "react";
import {
  Camera,
  ChevronRight,
  LogOut,
  Moon,
  Sun,
  Trash2,
  User,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { useLogout } from "@/features/auth/hooks/useAuth";
import { useDeleteAvatar, useUploadAvatar } from "@/features/profile/hooks/useProfile";
import { useThemeStore } from "@/stores/theme.store";
import { UserAvatar } from "./UserAvatar";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api-client";

interface ProfileMenuProps {
  collapsed?: boolean;
}

export function ProfileMenu({ collapsed = false }: ProfileMenuProps) {
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

  const isBusy = uploadAvatar.isPending || deleteAvatar.isPending;
  const displayName = user.name || user.email.split("@")[0];

  return (
    <div ref={menuRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isBusy}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl bg-[var(--color-surface-muted)] p-2 transition-all duration-200 hover:bg-[var(--color-border)]/60",
          collapsed && "justify-center rounded-full bg-transparent p-1 hover:bg-[var(--color-surface-muted)]",
          open && !collapsed && "bg-[var(--color-border)]/40",
          open && collapsed && "bg-[var(--color-surface-muted)]",
          isBusy && "opacity-60",
        )}
        aria-label="Account menu"
        aria-expanded={open}
      >
        <UserAvatar
          name={user.name}
          email={user.email}
          avatarUrl={user.avatarUrl}
          size={collapsed ? "xs" : "sm"}
        />
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-medium text-[var(--color-text)]">{displayName}</p>
              <p className="truncate text-xs text-[var(--color-text-muted)] capitalize">
                {user.authProvider === "google" ? "Google account" : "Email account"}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
          </>
        )}
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
          className={cn(
            "absolute bottom-full z-50 mb-2 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl",
            collapsed ? "left-0 w-72" : "left-0 right-0 w-full min-w-[16rem]",
          )}
          role="menu"
        >
          <button
            type="button"
            className="flex w-full items-center gap-3 border-b border-[var(--color-border)] px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-muted)]"
            onClick={() => setOpen(false)}
          >
            <UserAvatar name={user.name} email={user.email} avatarUrl={user.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--color-text)]">{displayName}</p>
              <p className="truncate text-xs text-[var(--color-text-muted)]">{user.email}</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
          </button>

          {avatarError && (
            <p className="border-b border-[var(--color-border)] px-4 py-2 text-xs text-red-500">
              {avatarError}
            </p>
          )}

          <div className="p-1.5">
            <MenuItem
              icon={<Camera className="h-4 w-4" />}
              label={user.avatarUrl ? "Replace photo" : "Add photo"}
              disabled={isBusy}
              onClick={() => fileInputRef.current?.click()}
            />
            {user.avatarUrl && (
              <MenuItem
                icon={<Trash2 className="h-4 w-4" />}
                label="Remove photo"
                disabled={isBusy}
                onClick={() => deleteAvatar.mutate()}
              />
            )}
            <MenuItem
              icon={<User className="h-4 w-4" />}
              label="Profile"
              onClick={() => setOpen(false)}
            />
            <MenuItem
              icon={isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              label="Theme"
              trailing={isDark ? "Dark" : "Light"}
              onClick={() => setTheme(isDark ? "light" : "dark")}
            />
          </div>

          <div className="border-t border-[var(--color-border)] p-1.5">
            <MenuItem
              icon={<LogOut className="h-4 w-4" />}
              label="Log out"
              onClick={() => {
                setOpen(false);
                logout.mutate();
              }}
              disabled={logout.isPending}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  trailing,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  trailing?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-muted)] disabled:opacity-50"
    >
      <span className="text-[var(--color-text-muted)]">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {trailing && <span className="text-xs text-[var(--color-text-muted)]">{trailing}</span>}
    </button>
  );
}
