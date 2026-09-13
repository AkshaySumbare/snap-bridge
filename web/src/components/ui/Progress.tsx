import { cn } from "@/lib/cn";

interface ProgressProps {
  value: number;
  className?: string;
}

export function Progress({ value, className }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-muted)]",
        className,
      )}
    >
      <div
        className="h-full rounded-full bg-brand-600 transition-[width] duration-150 ease-out dark:bg-brand-500"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
