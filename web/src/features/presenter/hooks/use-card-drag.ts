/**
 * Pointer-drag for workspace cards.
 *
 * Position is held locally while the pointer is down and committed to the
 * store once on release — dragging a card would otherwise push ~60 entries
 * a second onto the undo stack.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useLiquidTextStore } from "../stores/liquid-text-store";

interface DragState {
  cardId: string;
  /** Offset from the card's origin to the grab point, in canvas units. */
  grabX: number;
  grabY: number;
  x: number;
  y: number;
}

interface UseCardDragOptions {
  zoom: number;
  /** Canvas surface, used to convert client coords into canvas coords. */
  surfaceRef: React.RefObject<HTMLElement>;
  /** Called instead of a move when the card is released over a wrapper. */
  onDropOnWrapper?: (cardId: string, wrapperId: string) => void;
}

export function useCardDrag({ zoom, surfaceRef, onDropOnWrapper }: UseCardDragOptions) {
  const moveCard = useLiquidTextStore((state) => state.moveCard);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  dragRef.current = drag;

  const start = useCallback(
    (event: React.PointerEvent, cardId: string, cardX: number, cardY: number) => {
      const surface = surfaceRef.current;
      if (!surface) return;
      const bounds = surface.getBoundingClientRect();
      const pointerX = (event.clientX - bounds.left) / zoom;
      const pointerY = (event.clientY - bounds.top) / zoom;
      setDrag({
        cardId,
        grabX: pointerX - cardX,
        grabY: pointerY - cardY,
        x: cardX,
        y: cardY,
      });
    },
    [surfaceRef, zoom],
  );

  useEffect(() => {
    if (!drag) return undefined;

    function handleMove(event: PointerEvent) {
      const surface = surfaceRef.current;
      const current = dragRef.current;
      if (!surface || !current) return;
      const bounds = surface.getBoundingClientRect();
      setDrag({
        ...current,
        x: Math.max(0, (event.clientX - bounds.left) / zoom - current.grabX),
        y: Math.max(0, (event.clientY - bounds.top) / zoom - current.grabY),
      });
    }

    function handleUp(event: PointerEvent) {
      const current = dragRef.current;
      setDrag(null);
      if (!current) return;

      // The dragged card sits under the pointer; hide it for one hit-test to
      // see whether it was released over a wrapper.
      const dragged = document.querySelector<HTMLElement>(`[data-card-id="${current.cardId}"]`);
      const previous = dragged?.style.pointerEvents ?? "";
      if (dragged) dragged.style.pointerEvents = "none";
      const under = document.elementFromPoint(event.clientX, event.clientY);
      if (dragged) dragged.style.pointerEvents = previous;

      const wrapperId = under?.closest<HTMLElement>("[data-wrapper-id]")?.dataset.wrapperId;
      if (onDropOnWrapper && wrapperId) {
        onDropOnWrapper(current.cardId, wrapperId);
        return;
      }
      moveCard(current.cardId, Math.round(current.x), Math.round(current.y));
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [drag, moveCard, onDropOnWrapper, surfaceRef, zoom]);

  return {
    startDrag: start,
    draggingCardId: drag?.cardId ?? null,
    /** Live position of the card under the pointer, or null when idle. */
    dragPosition: drag ? { x: drag.x, y: drag.y } : null,
  };
}
