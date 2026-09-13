import { NavLink } from "react-router-dom";
import { Zap } from "lucide-react";
import { NAV_ENTRIES } from "@/config/nav-items";
import { useSidebarStore } from "@/stores/sidebar.store";
import { SidebarToggle } from "./SidebarToggle";
import { SidebarNavGroup } from "./SidebarNavGroup";
import { ProfileMenu } from "./ProfileMenu";
import { cn } from "@/lib/cn";

export function AppSidebar() {
  const { isOpen, isCollapsed, setOpen } = useSidebarStore();

  function closeMobile() {
    if (window.innerWidth < 768) setOpen(false);
  }

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
              <div className="flex flex-col items-center gap-2 md:hidden">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
                  <Zap className="h-4 w-4" />
                </div>
                <SidebarToggle />
              </div>
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

        <nav className="flex-1 space-y-3 overflow-y-auto p-3" aria-label="Main navigation">
          {NAV_ENTRIES.map((entry) => {
            if (entry.type === "link") {
              if (!entry.available) return null;
              const Icon = entry.icon;
              return (
                <NavLink
                  key={entry.to}
                  to={entry.to}
                  title={isCollapsed ? entry.label : undefined}
                  onClick={closeMobile}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                      isCollapsed && "justify-center px-2",
                      isActive
                        ? "bg-[var(--color-surface-muted)] text-[var(--color-text)]"
                        : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]",
                    )
                  }
                >
                  <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                  {!isCollapsed && <span className="truncate">{entry.label}</span>}
                </NavLink>
              );
            }

            if (entry.type === "group") {
              return (
                <SidebarNavGroup
                  key={entry.label}
                  label={entry.label}
                  icon={entry.icon}
                  basePath={entry.basePath}
                  items={entry.children}
                  available={entry.available}
                  collapsed={isCollapsed}
                  onNavigate={closeMobile}
                />
              );
            }

            return null;
          })}
        </nav>

        <div className="shrink-0 border-t border-[var(--color-border)] p-2">
          <ProfileMenu collapsed={isCollapsed} />
        </div>
      </aside>
    </>
  );
}
