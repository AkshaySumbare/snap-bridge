import { PanelLeft } from "lucide-react";
import { useSidebarStore } from "@/stores/sidebar.store";
import { cn } from "@/lib/cn";

interface SidebarToggleProps {
  className?: string;
}

export function SidebarToggle({ className }: SidebarToggleProps) {
  const { isOpen, isCollapsed, toggleOpen, toggleCollapsed } = useSidebarStore();

  function handleClick() {
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      toggleOpen();
      return;
    }
    toggleCollapsed();
  }

  const ariaLabel =
    typeof window !== "undefined" && window.innerWidth < 768
      ? isOpen
        ? "Close sidebar"
        : "Open sidebar"
      : isCollapsed
        ? "Expand sidebar"
        : "Collapse sidebar";

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]",
        className,
      )}
      aria-label={ariaLabel}
      aria-expanded={typeof window !== "undefined" && window.innerWidth < 768 ? isOpen : !isCollapsed}
    >
      <PanelLeft className="h-5 w-5" strokeWidth={1.75} />
    </button>
  );
}
