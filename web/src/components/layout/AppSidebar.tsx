import { NavLink } from "react-router-dom";
import { Zap } from "lucide-react";
import { NAV_ITEMS } from "@/config/nav-items";
import { useSidebarStore } from "@/stores/sidebar.store";
import { SidebarToggle } from "./SidebarToggle";
import { ProfileMenu } from "./ProfileMenu";
import { cn } from "@/lib/cn";

function SoonBadge() {
  return (
    <span className="ml-auto rounded-md bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-700 dark:bg-brand-950 dark:text-brand-300">
      Soon
    </span>
  );
}

export function AppSidebar() {
  const { isOpen, isCollapsed, setOpen } = useSidebarStore();

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-[var(--color-surface)] transition-all duration-300 ease-in-out",
          "md:sticky md:top-0 md:z-30 md:h-screen md:translate-x-0 md:border-r md:border-[var(--color-border)]",
          isCollapsed ? "md:w-[3.75rem]" : "md:w-[260px]",
          isOpen ? "w-[260px] translate-x-0" : "-translate-x-full w-[260px]",
        )}
      >
        {/* Header: brand + collapse toggle */}
        <div
          className={cn(
            "flex h-14 shrink-0 items-center border-b border-[var(--color-border)] px-3",
            isCollapsed ? "justify-center" : "justify-between",
          )}
        >
          {!isCollapsed ? (
            <>
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
                  <Zap className="h-4 w-4" />
                </div>
                <span className="truncate text-sm font-semibold text-[var(--color-text)]">
                  SnapBridge
                </span>
              </div>
              <SidebarToggle />
            </>
          ) : (
            <>
              {/* Mobile drawer: keep toggle visible when collapsed state is persisted */}
              <div className="flex flex-col items-center gap-2 md:hidden">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
                  <Zap className="h-4 w-4" />
                </div>
                <SidebarToggle />
              </div>

              {/* Desktop collapsed: logo by default, toggle on hover */}
              <div className="group relative hidden h-9 w-9 items-center justify-center md:flex">
                <div
                  aria-hidden
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white transition-opacity duration-150 group-hover:opacity-0"
                >
                  <Zap className="h-4 w-4" />
                </div>
                <SidebarToggle
                  className="absolute inset-0 opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto"
                />
              </div>
            </>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;

            if (item.available && item.to) {
              return (
                <NavLink
                  key={item.label}
                  to={item.to}
                  title={isCollapsed ? item.label : undefined}
                  onClick={() => {
                    if (window.innerWidth < 768) setOpen(false);
                  }}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      isCollapsed && "justify-center px-2",
                      isActive
                        ? "bg-[var(--color-surface-muted)] text-[var(--color-text)]"
                        : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]",
                    )
                  }
                >
                  <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              );
            }

            return (
              <span
                key={item.label}
                title={isCollapsed ? `${item.label} — Coming soon` : undefined}
                className={cn(
                  "flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--color-text-muted)] opacity-50",
                  isCollapsed && "justify-center px-2",
                )}
                aria-disabled="true"
              >
                <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                {!isCollapsed && (
                  <>
                    <span className="truncate">{item.label}</span>
                    <SoonBadge />
                  </>
                )}
              </span>
            );
          })}
        </nav>

        {/* Bottom: profile */}
        <div className="shrink-0 border-t border-[var(--color-border)] p-2">
          <ProfileMenu collapsed={isCollapsed} />
        </div>
      </aside>
    </>
  );
}
