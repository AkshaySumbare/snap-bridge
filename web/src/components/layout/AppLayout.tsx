import { Outlet } from "react-router-dom";
import { Logo } from "./Logo";
import { AppNav, AppNavMobile } from "./AppNav";
import { ProfileMenu } from "./ProfileMenu";

export function AppLayout() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]/80 backdrop-blur-md">
        <div className="flex h-16 w-full items-center px-4 sm:px-6">
          <Logo to="/dashboard" className="shrink-0" />
          <AppNav />
          <div className="ml-auto shrink-0 pl-4">
            <ProfileMenu />
          </div>
        </div>
        <AppNavMobile />
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
