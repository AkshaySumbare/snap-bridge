import { cn } from "@/lib/cn";

export function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <input
      type="checkbox"
      checked={Boolean(checked)}
      disabled={disabled}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      className={cn("h-4 w-4 accent-brand-600", className)}
    />
  );
}
