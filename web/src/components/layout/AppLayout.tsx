import { Outlet, useLocation } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { SidebarToggle } from "./SidebarToggle";
import { useSidebarStore } from "@/stores/sidebar.store";
import { cn } from "@/lib/cn";

export function AppLayout() {
  const isOpen = useSidebarStore((s) => s.isOpen);
  const location = useLocation();
  const isChatPage = location.pathname === "/vault/ask";

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        {!isOpen && (
          <header className="flex h-14 shrink-0 items-center border-b border-[var(--color-border)] px-4 md:hidden">
            <SidebarToggle />
          </header>
        )}

        <main
          className={cn(
            "flex flex-1 flex-col overflow-hidden",
            !isChatPage && "overflow-auto p-4 sm:p-6 lg:p-8",
          )}
        >
          <div
            className={cn(
              "mx-auto w-full flex-1",
              isChatPage ? "flex min-h-0 max-w-none flex-col" : "max-w-6xl",
            )}
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
