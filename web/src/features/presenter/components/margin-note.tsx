/**
 * A comment docked in the reader's right-hand gutter, level with the passage
 * it annotates.
 *
 * This is where a comment is born: beside the text, small, editable in place.
 * Dragging it onto the workspace promotes it to a full card — the same record,
 * moved, so its text and its source survive the trip.
 */

import { Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { HIGHLIGHT_STYLES } from "../constants";
import { useLiquidTextStore } from "../stores/liquid-text-store";
import { useLiquidTextUiStore } from "../stores/liquid-text-ui-store";
import type { NoteCard } from "../types";
import { writeDragPayload } from "../utils/drag-payload";
import { NoteEditor } from "./note-editor";

interface MarginNoteProps {
  card: NoteCard;
}

export function MarginNote({ card }: MarginNoteProps) {
  const updateCardText = useLiquidTextStore((state) => state.updateCardText);
  const openModal = useLiquidTextUiStore((state) => state.openModal);
  const editingCardId = useLiquidTextUiStore((state) => state.editingCardId);
  const setEditingCard = useLiquidTextUiStore((state) => state.setEditingCard);

  const editing = editingCardId === card.id;
  const style = HIGHLIGHT_STYLES[card.color];

  return (
    <div
      data-margin-card-id={card.id}
      data-card-id={card.id}
      draggable={!editing}
      onDragStart={(event) =>
        writeDragPayload(event.dataTransfer, {
          kind: "margin-note",
          cardId: card.id,
        })
      }
      className={cn(
        "group w-full cursor-grab rounded-lg border bg-surface-overlay px-2 py-1.5 shadow-elevation-pop transition-shadow active:cursor-grabbing",
        card.color === "clear" ? "border-border-subtle" : style.border,
      )}
    >
      <div className="mb-1 flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-[9px] uppercase tracking-wide text-text-muted">
          {card.title || (card.source ? `p.${card.source.pageNumber}` : "Note")}
        </span>
        <button
          type="button"
          aria-label="Delete comment"
          onClick={() => openModal({ kind: "deleteCard", cardId: card.id })}
          className="flex h-4 w-4 items-center justify-center rounded text-text-muted opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {editing ? (
        <NoteEditor
          value={card.text}
          minRows={2}
          className="text-[11.5px] leading-snug"
          onSave={(text) => {
            updateCardText(card.id, text);
            setEditingCard(null);
          }}
          onCancel={() => setEditingCard(null)}
        />
      ) : (
        <button type="button" onClick={() => setEditingCard(card.id)} className="w-full text-left">
          <span
            className={cn(
              "block whitespace-pre-wrap text-[11.5px] leading-snug",
              card.text.trim().length === 0 ? "italic text-text-muted" : "text-foreground",
            )}
          >
            {card.text.trim().length === 0 ? "Type your comment…" : card.text}
          </span>
        </button>
      )}

      <span className="mt-1 block text-[9px] text-text-muted opacity-0 transition-opacity group-hover:opacity-100">
        Drag right onto the workspace →
      </span>
    </div>
  );
}
