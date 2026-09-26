/**
 * The seven-swatch ink row shared by the selection toolbar and the card
 * action bar.
 */

import { cn } from "@/lib/utils";

import { HIGHLIGHT_STYLES, PALETTE_ORDER } from "../constants";
import type { HighlightColor } from "../types";

interface ColorPaletteProps {
  value: HighlightColor | null;
  onChange: (color: HighlightColor) => void;
  size?: "sm" | "md";
  className?: string;
}

export function ColorPalette({ value, onChange, size = "md", className }: ColorPaletteProps) {
  const dimension = size === "sm" ? "h-5 w-5" : "h-7 w-7";

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {PALETTE_ORDER.map((color) => {
        const style = HIGHLIGHT_STYLES[color];
        const isActive = value === color;
        return (
          <button
            key={color}
            type="button"
            title={style.label}
            aria-label={style.label}
            aria-pressed={isActive}
            onClick={() => onChange(color)}
            className={cn(
              "relative rounded-full transition-transform hover:scale-110",
              dimension,
              style.swatch,
              isActive && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-surface-raised",
            )}
          >
            {color === "clear" && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="h-px w-full rotate-45 bg-border-strong" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
