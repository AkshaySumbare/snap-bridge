import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

interface DropdownContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  rootRef: React.RefObject<HTMLDivElement | null>;
  menuId: string;
}

const DropdownContext = createContext<DropdownContextValue | null>(null);

export function DropdownMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      const menu = document.getElementById(menuId);
      if (menu?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, menuId]);

  return (
    <DropdownContext.Provider value={{ open, setOpen, rootRef, menuId }}>
      <div ref={rootRef} className="relative inline-flex">
        {children}
      </div>
    </DropdownContext.Provider>
  );
}

export function DropdownMenuTrigger({
  asChild,
  children,
}: {
  asChild?: boolean;
  children: ReactNode;
}) {
  const ctx = useContext(DropdownContext);
  if (!ctx) return <>{children}</>;

  const toggle = (event: MouseEvent) => {
    event.stopPropagation();
    ctx.setOpen(!ctx.open);
  };

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{
      onClick?: (event: MouseEvent) => void;
    }>;
    return cloneElement(child, {
      onClick: (event: MouseEvent) => {
        child.props.onClick?.(event);
        toggle(event);
      },
    });
  }

  return (
    <button type="button" onClick={toggle}>
      {children}
    </button>
  );
}

export function DropdownMenuContent({
  children,
  className,
  align,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  align?: string;
  onClick?: (event: MouseEvent) => void;
}) {
  const ctx = useContext(DropdownContext);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!ctx?.open) return;
    const node = ctx.rootRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const width = 224;
    const left = align === "end" ? Math.max(8, rect.right - width) : rect.left;
    setPos({ top: rect.bottom + 4, left });
  }, [ctx?.open, align, ctx?.rootRef]);

  if (!ctx?.open) return null;

  return createPortal(
    <div
      id={ctx.menuId}
      role="menu"
      style={{ top: pos.top, left: pos.left }}
      className={cn(
        "fixed z-[60] min-w-[10rem] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg",
        className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

export function DropdownMenuItem({
  children,
  onClick,
  onSelect,
  className,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  onSelect?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const ctx = useContext(DropdownContext);
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled) return;
        onClick?.();
        onSelect?.();
        ctx?.setOpen(false);
      }}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function DropdownMenuSeparator() {
  return <div className="my-1 h-px bg-[var(--color-border)]" />;
}

export function DropdownMenuLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)]", className)}>
      {children}
    </div>
  );
}

export function useOpenState() {
  return useState(false);
}
