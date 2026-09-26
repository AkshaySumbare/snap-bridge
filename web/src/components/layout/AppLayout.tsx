import { Outlet, useLocation } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { SidebarToggle } from "./SidebarToggle";
import { useSidebarStore } from "@/stores/sidebar.store";
import { cn } from "@/lib/cn";

export function AppLayout() {
  const isOpen = useSidebarStore((s) => s.isOpen);
  const location = useLocation();
  const isImmersive =
    location.pathname === "/vault/ask" || location.pathname.startsWith("/presenter");

  return (
    <div
      className={cn(
        "flex bg-[var(--color-bg)]",
        isImmersive ? "h-screen max-h-dvh overflow-hidden" : "min-h-screen",
      )}
    >
      <AppSidebar />

      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col",
          isImmersive && "overflow-hidden",
        )}
      >
        {!isOpen && (
          <header className="flex h-14 shrink-0 items-center border-b border-[var(--color-border)] px-4 md:hidden">
            <SidebarToggle />
          </header>
        )}

        <main
          className={cn(
            "flex flex-1 flex-col overflow-hidden",
            !isImmersive && "overflow-auto p-4 sm:p-6 lg:p-8",
          )}
        >
          <div
            className={cn(
              "mx-auto w-full flex-1",
              isImmersive ? "flex min-h-0 max-w-none flex-col" : "max-w-6xl",
            )}
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
