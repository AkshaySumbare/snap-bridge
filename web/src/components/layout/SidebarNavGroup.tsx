import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { NavGroupChild } from "@/config/nav-items";

function SoonBadge() {
  return (
    <span className="shrink-0 rounded-md bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-700 dark:bg-brand-950 dark:text-brand-300">
      Soon
    </span>
  );
}

interface SidebarNavGroupProps {
  label: string;
  icon: LucideIcon;
  basePath: string;
  items: NavGroupChild[];
  available: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}

export function SidebarNavGroup({
  label,
  icon: Icon,
  basePath,
  items,
  available,
  collapsed,
  onNavigate,
}: SidebarNavGroupProps) {
  const location = useLocation();
  const isActiveGroup = available && location.pathname.startsWith(basePath);
  const [open, setOpen] = useState(isActiveGroup);

  useEffect(() => {
    if (isActiveGroup) setOpen(true);
  }, [isActiveGroup]);

  if (collapsed) {
    return (
      <div className="space-y-1.5" title={label}>
        {!available && (
          <div
            className="flex items-center justify-center rounded-xl px-2 py-2.5 opacity-50"
            title={`${label} — Coming soon`}
          >
            <Icon className="h-5 w-5 text-[var(--color-text-muted)]" strokeWidth={1.75} />
          </div>
        )}
        {items.map((child) => {
          const ChildIcon = child.icon;
          if (child.available && child.to) {
            return (
              <NavLink
                key={child.label}
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
          }
          return (
            <span
              key={child.label}
              title={`${child.label} — Coming soon`}
              className="flex items-center justify-center rounded-xl px-2 py-2.5 opacity-40"
              aria-disabled="true"
            >
              <ChildIcon className="h-5 w-5 text-[var(--color-text-muted)]" strokeWidth={1.75} />
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
          isActiveGroup
            ? "bg-[var(--color-surface-muted)] text-[var(--color-text)]"
            : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]",
          !available && "opacity-90",
        )}
      >
        <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          {!available && <SoonBadge />}
          <ChevronRight
            className={cn(
              "h-4 w-4 text-[var(--color-text-muted)] transition-transform duration-200",
              open && "rotate-90",
            )}
          />
        </div>
      </button>

      {open && (
        <div className="mt-1 space-y-1 pl-3">
          {items.map((child) => {
            const ChildIcon = child.icon;

            if (child.available && child.to) {
              return (
                <NavLink
                  key={child.label}
                  to={child.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
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
            }

            return (
              <span
                key={child.label}
                className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--color-text-muted)] opacity-50"
                aria-disabled="true"
              >
                <ChildIcon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate">{child.label}</span>
                <SoonBadge />
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
