import { NavLink } from "react-router-dom";
import { cn } from "@/lib/cn";

const FEATURES = [
  { label: "Dashboard", to: "/dashboard", available: true },
  { label: "Clipboard Sync", available: false },
  { label: "Device Pairing", available: false },
  { label: "Capture History", available: false },
  { label: "Screenshot Vault", available: false },
  { label: "OCR Search", available: false },
] as const;

function ComingSoonBadge() {
  return (
    <span
      className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700 dark:bg-brand-950 dark:text-brand-300"
    >
      Soon
    </span>
  );
}

export function AppNav() {
  return (
    <nav
      className="hidden min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto px-4 md:flex lg:gap-2"
      aria-label="Main navigation"
    >
      {FEATURES.map((item) =>
        item.available ? (
          <NavLink
            key={item.label}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors lg:px-3",
                isActive
                  ? "bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]",
              )
            }
          >
            {item.label}
          </NavLink>
        ) : (
          <span
            key={item.label}
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-[var(--color-text-muted)] lg:px-3"
            aria-disabled="true"
            title="Coming soon"
          >
            <span className="hidden lg:inline">{item.label}</span>
            <span className="lg:hidden">{item.label.split(" ")[0]}</span>
            <ComingSoonBadge />
          </span>
        ),
      )}
    </nav>
  );
}

export function AppNavMobile() {
  return (
    <nav
      className="flex gap-2 overflow-x-auto border-b border-[var(--color-border)] px-4 py-2 md:hidden"
      aria-label="Main navigation"
    >
      {FEATURES.map((item) =>
        item.available ? (
          <NavLink
            key={item.label}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
                isActive
                  ? "bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                  : "text-[var(--color-text-muted)]",
              )
            }
          >
            {item.label}
          </NavLink>
        ) : (
          <span
            key={item.label}
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)]"
            aria-disabled="true"
          >
            {item.label.split(" ")[0]}
            <ComingSoonBadge />
          </span>
        ),
      )}
    </nav>
  );
}
