import { User } from "lucide-react";
import { cn } from "@/lib/cn";

interface UserAvatarProps {
  name: string | null;
  email: string;
  avatarUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

function getInitials(name: string | null | undefined, email: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

const sizeMap = {
  xs: "h-7 w-7 text-[10px]",
  sm: "h-9 w-9 text-sm",
  md: "h-12 w-12 text-base",
  lg: "h-16 w-16 text-lg",
};

export function UserAvatar({ name, email, avatarUrl, size = "sm", className }: UserAvatarProps) {
  const initials = getInitials(name, email);

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name || email}
        className={cn(
          "rounded-full border border-[var(--color-border)] object-cover",
          sizeMap[size],
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-teal-600 font-semibold text-white",
        sizeMap[size],
        className,
      )}
    >
      {name ? <span>{initials}</span> : <User className="h-4 w-4" />}
    </div>
  );
}
