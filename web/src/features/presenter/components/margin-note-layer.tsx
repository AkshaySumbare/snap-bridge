/**
 * The comment cards that sit on the reader/workspace seam.
 *
 * Rendered in the overlay that spans both panes rather than inside the
 * reader, for two reasons: the reader's scroller would clip anything hanging
 * over its right edge, and a card that is half on the canvas is already
 * halfway through the move the user is about to finish by dragging it.
 */

import { MARGIN_CARD_WIDTH } from "../constants";
import { useMarginPlacements } from "../hooks/use-margin-placements";
import { useLiquidTextStore } from "../stores/liquid-text-store";
import { useLiquidTextUiStore } from "../stores/liquid-text-ui-store";
import type { NoteCard } from "../types";
import { MarginNote } from "./margin-note";

interface MarginNoteLayerProps {
  overlayRef: React.RefObject<HTMLElement>;
  notes: readonly NoteCard[];
  revision: unknown;
}

export function MarginNoteLayer({ overlayRef, notes, revision }: MarginNoteLayerProps) {
  const editingCardId = useLiquidTextUiStore((state) => state.editingCardId);
  const highlights = useLiquidTextStore((state) => state.project.highlights);

  const anchors = notes.map((note) => ({
    cardId: note.id,
    highlightId: note.source?.highlightId ?? "",
  }));

  // Editing changes a card's height, and a comment can be created against a
  // brand-new highlight, so both feed the re-measure alongside the caller's key.
  const placements = useMarginPlacements(overlayRef, anchors, [
    revision,
    editingCardId,
    highlights,
  ]);
  const byCard = new Map(placements.map((placement) => [placement.cardId, placement]));

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {notes.map((note) => {
        const placement = byCard.get(note.id);
        if (!placement?.visible) return null;
        return (
          <div
            key={note.id}
            className="pointer-events-auto absolute"
            style={{ top: placement.top, left: placement.left, width: MARGIN_CARD_WIDTH }}
          >
            <MarginNote card={note} />
          </div>
        );
      })}
    </div>
  );
}
