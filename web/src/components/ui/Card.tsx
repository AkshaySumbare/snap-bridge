import { cn } from "@/lib/cn";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
}

export function Card({ children, className, title, description }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm",
        className,
      )}
    >
      {(title || description) && (
        <div className="mb-6 space-y-1">
          {title && <h2 className="text-xl font-semibold text-[var(--color-text)]">{title}</h2>}
          {description && (
            <p className="text-sm text-[var(--color-text-muted)]">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
