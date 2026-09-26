/**
 * The one floating card over a passage — for text just selected and for a
 * highlight already laid down.
 *
 * These were two components with two personalities: a bar over a live
 * selection, and a popover over an existing highlight. They offered
 * overlapping things in different places, so the reader had to learn which
 * card they were looking at before they could act. One card now, with the
 * actions a passage in that state can actually take:
 *
 *   selected text  → colour it, connect it, copy it
 *   a highlight    → recolour, connect again, copy, edit its extent, remove
 *
 * Positioned in viewport coordinates and clamped so it never leaves the
 * window, flipping above the passage when there is room.
 */

import { ClipboardCopy, Link2, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/lib/sonner";

import { cn } from "@/lib/utils";

import { useLiquidTextStore } from "../stores/liquid-text-store";
import { useLiquidTextUiStore } from "../stores/liquid-text-ui-store";
import type { HighlightColor } from "../types";
import { ColorPalette } from "./color-palette";

const TOOLBAR_WIDTH = 420;
/** Rough height, used only to decide whether the card fits above the passage. */
const TOOLBAR_HEIGHT = 150;

type Rect = { top: number; left: number; width: number; height: number };

/**
 * Where a highlight sits on screen right now.
 *
 * Measured rather than remembered: the highlight may have been opened by a
 * click, by a search hit or by a connector, and only the DOM knows where it
 * ended up after the last scroll.
 */
function measureHighlight(highlightId: string): Rect | null {
  const node = window.document.querySelector<HTMLElement>(`[data-highlight-id="${highlightId}"]`);
  if (!node) return null;
  const box = node.getBoundingClientRect();
  return { top: box.top, left: box.left, width: box.width, height: box.height };
}

export function PassageToolbar() {
  const selection = useLiquidTextUiStore((state) => state.selection);
  const setSelection = useLiquidTextUiStore((state) => state.setSelection);
  const activeColor = useLiquidTextUiStore((state) => state.activeColor);
  const setActiveColor = useLiquidTextUiStore((state) => state.setActiveColor);
  const activeHighlightId = useLiquidTextUiStore((state) => state.activeHighlightId);
  const setActiveHighlight = useLiquidTextUiStore((state) => state.setActiveHighlight);
  const setMobilePane = useLiquidTextUiStore((state) => state.setMobilePane);
  const startLinking = useLiquidTextUiStore((state) => state.startLinking);
  const reshapingHighlightId = useLiquidTextUiStore((state) => state.reshapingHighlightId);
  const setReshapingHighlight = useLiquidTextUiStore((state) => state.setReshapingHighlight);

  const highlights = useLiquidTextStore((state) => state.project.highlights);
  const addHighlight = useLiquidTextStore((state) => state.addHighlight);
  const setHighlightColor = useLiquidTextStore((state) => state.setHighlightColor);
  const removeHighlight = useLiquidTextStore((state) => state.removeHighlight);

  const highlight = highlights.find((entry) => entry.id === activeHighlightId) ?? null;

  // While a highlight is being re-drawn the next selection belongs to it,
  // not to this card.
  if (reshapingHighlightId !== null) return null;

  // A highlight the reader opened wins over a stale selection behind it.
  const rect: Rect | null = highlight ? measureHighlight(highlight.id) : (selection?.rect ?? null);
  if (!rect || (!highlight && !selection)) return null;

  const preferAbove = rect.top > TOOLBAR_HEIGHT + 16;
  const top = preferAbove ? rect.top - TOOLBAR_HEIGHT - 8 : rect.top + rect.height + 8;
  const left = Math.min(
    Math.max(12, rect.left + rect.width / 2 - TOOLBAR_WIDTH / 2),
    Math.max(12, window.innerWidth - TOOLBAR_WIDTH - 12),
  );

  /** What the card is about, whichever way it was opened. */
  const passage = highlight
    ? {
        documentId: highlight.documentId,
        paragraphId: highlight.paragraphId,
        pageNumber: highlight.pageNumber,
        text: highlight.text,
      }
    : {
        documentId: selection!.documentId,
        paragraphId: selection!.paragraphId,
        pageNumber: selection!.pageNumber,
        text: selection!.text,
      };

  function dismiss() {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    setActiveHighlight(null);
  }

  function handleColor(color: HighlightColor) {
    setActiveColor(color);
    if (highlight) {
      // `clear` is the eraser on this palette — the store deletes rather
      // than storing a colourless highlight.
      setHighlightColor(highlight.id, color);
      if (color === "clear") dismiss();
      return;
    }
    if (!selection) return;
    if (color === "clear") {
      toast.info("Pick a colour to highlight, or connect the passage without one.");
      return;
    }
    addHighlight(selection, color);
    toast.success(`Highlighted in ${color}`);
    dismiss();
  }

  /**
   * Hand the passage to the argument picker.
   *
   * Nothing is linked yet — this only captures where the reader is pointing.
   * The anchor is a ratio inside the paragraph's own box, not a page
   * coordinate, so the line stays on the words if the text is re-laid out,
   * and no highlight is created: linking works on plain text and should not
   * put ink on the page the reader did not ask for.
   */
  function startConnect() {
    if (!rect) return;
    /*
      The reader has said where the line starts; the card it lands on is in
      the workspace. On a narrow screen that is the next pane, so go there —
      otherwise the reader is left looking at the passage they just armed,
      with no sign of what to do next.
    */
    setMobilePane("workspace");
    const box = window.document.querySelector<HTMLElement>(
      `[data-paragraph-id="${passage.paragraphId}"]`,
    );
    const boxRect = box?.getBoundingClientRect();
    window.getSelection()?.removeAllRanges();
    setActiveHighlight(null);
    startLinking({
      documentId: passage.documentId,
      paragraphId: passage.paragraphId,
      pageNumber: passage.pageNumber,
      // Centre of the paragraph if it cannot be measured — a line on the
      // right passage beats no line at all.
      ratioX: boxRect
        ? (rect.left + rect.width / 2 - boxRect.left) / Math.max(1, boxRect.width)
        : 0.5,
      ratioY: boxRect
        ? (rect.top + rect.height / 2 - boxRect.top) / Math.max(1, boxRect.height)
        : 0.5,
    });
  }

  const primary =
    "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-foreground hover:bg-surface-sunken";
  const secondary =
    "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface-sunken hover:text-foreground";

  return (
    <div
      className="fixed z-50 rounded-2xl border border-border-subtle bg-surface-overlay/95 shadow-elevation-pop backdrop-blur"
      style={{ top, left, width: TOOLBAR_WIDTH }}
      onMouseDown={(event) => {
        // Keep the selection alive under the card; a highlight's card is a
        // popover and should not eat clicks meant for the page behind it.
        if (!highlight) event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {highlight && (
        <p className="line-clamp-2 px-3 pt-2 font-serif text-[11.5px] leading-snug text-text-muted">
          {highlight.text}
        </p>
      )}

      <div className="flex items-center gap-1 px-3 pb-1.5 pt-2">
        <button type="button" onClick={startConnect} className={primary}>
          <Link2 className="h-4 w-4" />
          Connect to argument
        </button>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(passage.text);
            toast.success("Text copied");
            dismiss();
          }}
          className={primary}
        >
          <ClipboardCopy className="h-4 w-4" />
          Copy text
        </button>
      </div>

      <div className="flex items-center gap-3 border-t border-border-subtle px-3 py-2">
        <ColorPalette value={highlight ? highlight.color : activeColor} onChange={handleColor} />
      </div>

      {/* Only a highlight that exists can be edited, removed or dismissed. */}
      {highlight && (
        <div className="flex items-center justify-between border-t border-border-subtle px-3 py-2">
          <span className="flex items-center gap-1">
            <button type="button" className={secondary} onClick={dismiss}>
              Done
            </button>
            <button
              type="button"
              className={secondary}
              onClick={() => setReshapingHighlight(highlight.id)}
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
          </span>
          <button
            type="button"
            onClick={() => {
              removeHighlight(highlight.id);
              dismiss();
            }}
            className={cn(secondary, "hover:bg-destructive/10 hover:text-destructive")}
          >
            <Trash2 className="h-3 w-3" />
            Remove highlight
          </button>
        </div>
      )}
    </div>
  );
}
