import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { NavGroupChild } from "@/config/nav-items";

interface SidebarNavGroupProps {
  label: string;
  icon: LucideIcon;
  basePath: string;
  children: NavGroupChild[];
  collapsed: boolean;
  onNavigate?: () => void;
}

export function SidebarNavGroup({
  label,
  icon: Icon,
  basePath,
  children,
  collapsed,
  onNavigate,
}: SidebarNavGroupProps) {
  const location = useLocation();
  const isActiveGroup = location.pathname.startsWith(basePath);
  const [open, setOpen] = useState(isActiveGroup);

  useEffect(() => {
    if (isActiveGroup) setOpen(true);
  }, [isActiveGroup]);

  if (collapsed) {
    return (
      <div className="space-y-0.5">
        {children.map((child) => {
          const ChildIcon = child.icon;
          return (
            <NavLink
              key={child.to}
              to={child.to}
              title={child.label}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "flex items-center justify-center rounded-xl px-2 py-2.5 transition-colors",
                  isActive
                    ? "bg-[var(--color-surface-muted)] text-[var(--color-text)]"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]",
                )
              }
            >
              <ChildIcon className="h-5 w-5" strokeWidth={1.75} />
            </NavLink>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          isActiveGroup
            ? "bg-[var(--color-surface-muted)] text-[var(--color-text)]"
            : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]",
        )}
      >
        <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
        <span className="flex-1 truncate text-left">{label}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="mt-0.5 space-y-0.5 pl-3">
          {children.map((child) => {
            const ChildIcon = child.icon;
            return (
              <NavLink
                key={child.to}
                to={child.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-brand-100 font-medium text-brand-800 dark:bg-brand-950 dark:text-brand-200"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]",
                  )
                }
              >
                <ChildIcon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{child.label}</span>
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}
