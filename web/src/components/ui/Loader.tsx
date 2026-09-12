import { cn } from "@/lib/cn";

interface LoaderProps {
  size?: "sm" | "md" | "lg";
  label?: string;
  fullScreen?: boolean;
  className?: string;
}

const sizeMap = {
  sm: "h-5 w-5 border-2",
  md: "h-8 w-8 border-2",
  lg: "h-12 w-12 border-[3px]",
};

export function Loader({ size = "md", label, fullScreen = false, className }: LoaderProps) {
  const spinner = (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)}>
      <div
        className={cn(
          "animate-spin rounded-full border-brand-200 border-t-brand-600 dark:border-brand-800 dark:border-t-brand-400",
          sizeMap[size],
        )}
        role="status"
        aria-label={label ?? "Loading"}
      />
      {label && (
        <p className="text-sm font-medium text-[var(--color-text-muted)]">{label}</p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-surface-muted)]/80 backdrop-blur-sm">
        {spinner}
      </div>
    );
  }

  return spinner;
}

export function PageLoader({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader size="lg" label={label} />
    </div>
  );
}
