import { Outlet } from "react-router-dom";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

export function AuthLayout() {
  return (
    <div className="relative min-h-screen bg-[var(--color-bg)]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-brand-600/10 blur-3xl" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-6 py-5">
        <Logo />
        <ThemeToggle />
      </header>

      <main className="relative z-10 flex min-h-[calc(100vh-5rem)] items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
