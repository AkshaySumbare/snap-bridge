import { Link } from "react-router-dom";
import { Zap } from "lucide-react";
import { cn } from "@/lib/cn";

interface LogoProps {
  className?: string;
  to?: string;
}

export function Logo({ className, to = "/" }: LogoProps) {
  return (
    <Link to={to} className={cn("inline-flex items-center gap-2.5", className)}>
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
        <Zap className="h-5 w-5" />
      </div>
      <div>
        <span className="text-lg font-bold tracking-tight text-[var(--color-text)]">
          SnapBridge
        </span>
        <p className="text-xs text-[var(--color-text-muted)]">Capture & sync</p>
      </div>
    </Link>
  );
}
