/**
 * Note text that folds past four lines, with the toggle sitting at the end
 * of the fold rather than under it.
 *
 * The clamp is decided by measuring, not by counting characters — four lines
 * of serif at card width is a wildly different character count from four
 * lines of a narrow wrapper column, and a newline-count heuristic misses
 * wrapped prose entirely. The measured element IS the clamped element, so
 * the answer stays honest through resizes and edits.
 *
 * Folded, the toggle sits on its own line under the clamp so it never covers
 * the last visible line. Expanded, it trails the last word inline.
 */

import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface ClampedTextProps {
  text: string;
  className?: string;
  /** Lines shown before the fold. Cards use 4; the wrapper label uses 2. */
  lines?: number;
}

export function ClampedText({ text, className, lines = 4 }: ClampedTextProps) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const paragraphRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const element = paragraphRef.current;
    if (!element) return undefined;

    const check = () => {
      // While clamped, overflow shows as scrollHeight past clientHeight.
      // While expanded we keep the last verdict — collapsing back must stay
      // offered, or the reader is stranded open.
      if (!expanded) setOverflows(element.scrollHeight > element.clientHeight + 1);
    };

    check();
    // Absent in jsdom; every browser we target has it. Without the observer
    // the clamp still measures once per render — only live resizes are lost.
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(check);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded, text]);

  const toggle = "text-[11px] font-medium text-primary hover:underline";

  function onToggle(event: React.MouseEvent) {
    event.stopPropagation();
    setExpanded((current) => !current);
  }

  const stop = (event: React.PointerEvent) => event.stopPropagation();

  return (
    <div>
      <p
        ref={paragraphRef}
        className={cn(className)}
        style={
          !expanded
            ? {
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: lines,
                overflow: "hidden",
              }
            : undefined
        }
      >
        {text}
        {expanded && (
          <>
            {" "}
            <button type="button" onPointerDown={stop} onClick={onToggle} className={toggle}>
              Show less
            </button>
          </>
        )}
      </p>

      {overflows && !expanded && (
        <button
          type="button"
          onPointerDown={stop}
          onClick={onToggle}
          className={cn(toggle, "mt-0.5 block")}
        >
          Show more
        </button>
      )}
    </div>
  );
}
