/**
 * Per-card controls, revealed on hover in the card's own header.
 *
 * Two buttons, both direct: edit opens the card's text straight away, delete
 * asks first. There used to be an overflow menu behind a "…" holding
 * duplicate, take-out-of-point, connect-to-text, unpin and a colour row; it
 * was removed at the owner's request in favour of the plain edit icon, so
 * nothing here is one click away from a menu any more. Connect still lives
 * on the card's own footer, which is why losing the menu entry cost nothing.
 */

import { Pencil, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { useLiquidTextUiStore } from "../stores/liquid-text-ui-store";
import type { WorkspaceCard } from "../types";

interface CardActionsProps {
  card: WorkspaceCard;
}

export function CardActions({ card }: CardActionsProps) {
  const setEditingCard = useLiquidTextUiStore((state) => state.setEditingCard);
  const openModal = useLiquidTextUiStore((state) => state.openModal);

  /** Header buttons sit on the drag handle, so they must not start a drag. */
  const stopDrag = (event: React.PointerEvent) => event.stopPropagation();

  return (
    <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
      <button
        type="button"
        aria-label="Edit text"
        title="Edit text"
        onPointerDown={stopDrag}
        onClick={(event) => {
          event.stopPropagation();
          setEditingCard(card.id);
        }}
        className="flex h-5 w-5 items-center justify-center rounded text-text-muted hover:bg-surface-sunken hover:text-foreground"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        aria-label="Delete card"
        title="Delete"
        onPointerDown={stopDrag}
        onClick={(event) => {
          event.stopPropagation();
          openModal({ kind: "deleteCard", cardId: card.id });
        }}
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded text-text-muted",
          "hover:bg-destructive/10 hover:text-destructive",
        )}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
