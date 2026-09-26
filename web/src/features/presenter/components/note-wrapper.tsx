/**
 * A titled container on the canvas that notes and excerpts file into.
 *
 * The wrapper owns its members' layout — they render stacked under the
 * heading in creation order, full width, with no free position of their own.
 * Dropping a dragged card anywhere over the wrapper files it; the card's own
 * ⋯ menu takes it out again.
 */

import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { useLiquidTextStore } from "../stores/liquid-text-store";
import { useLiquidTextUiStore } from "../stores/liquid-text-ui-store";
import type { NoteWrapper, WorkspaceCard } from "../types";
import { CanvasCard } from "./canvas-card";
import { ClampedText } from "./clamped-text";

interface NoteWrapperViewProps {
  wrapper: NoteWrapper;
  members: readonly WorkspaceCard[];
  position: { x: number; y: number };
  selectedIds: readonly string[];
  draggingCardId: string | null;
  onStartDrag: (event: React.PointerEvent, card: WorkspaceCard) => void;
  onStartWrapperDrag: (event: React.PointerEvent, wrapper: NoteWrapper) => void;
  onSelectCard: (event: React.MouseEvent, cardId: string) => void;
}

export function NoteWrapperView({
  wrapper,
  members,
  position,
  selectedIds,
  draggingCardId,
  onStartDrag,
  onStartWrapperDrag,
  onSelectCard,
}: NoteWrapperViewProps) {
  const renameWrapper = useLiquidTextStore((state) => state.renameWrapper);
  const openModal = useLiquidTextUiStore((state) => state.openModal);
  const toggleWrapperCollapsed = useLiquidTextStore((state) => state.toggleWrapperCollapsed);
  const addNoteInWrapper = useLiquidTextStore((state) => state.addNoteInWrapper);
  const editingCardId = useLiquidTextUiStore((state) => state.editingCardId);
  const setEditingCard = useLiquidTextUiStore((state) => state.setEditingCard);

  // The wrapper's heading borrows the card-editing slot with its own id, so
  // one editor is open at a time across the whole canvas.
  const editingTitle = editingCardId === wrapper.id;
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTitle) {
      titleRef.current?.focus();
      titleRef.current?.select();
    }
  }, [editingTitle]);

  return (
    <div
      data-wrapper-id={wrapper.id}
      style={{ left: position.x, top: position.y, width: wrapper.width }}
      className="group/wrap absolute"
    >
      <div className="rounded-xl border-2 border-brand-subtle-foreground/40 bg-surface-raised/80 shadow-elevation-raised">
        {/* Title lives inside the box now, clamped to two lines, with the
            controls on the same row so the box reads as one unit rather
            than a label floating over a separate frame. */}
        <div
          onPointerDown={(event) => onStartWrapperDrag(event, wrapper)}
          className="flex cursor-grab items-start gap-2 rounded-t-xl border-b border-border-subtle px-2 py-1.5 active:cursor-grabbing"
        >
          {editingTitle ? (
            <input
              ref={titleRef}
              defaultValue={wrapper.title}
              onPointerDown={(event) => event.stopPropagation()}
              onBlur={(event) => {
                const next = event.target.value.trim();
                if (next) renameWrapper(wrapper.id, next);
                setEditingCard(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setEditingCard(null);
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              className="min-w-0 flex-1 rounded bg-input-background px-1.5 py-0.5 text-[13px] font-semibold text-foreground outline-none ring-1 ring-ring"
            />
          ) : (
            <span
              onDoubleClick={() => setEditingCard(wrapper.id)}
              title="Double-click to rename"
              className="min-w-0 flex-1"
            >
              <ClampedText
                text={wrapper.title}
                lines={2}
                className="text-[13px] font-semibold leading-snug text-foreground"
              />
            </span>
          )}

          <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/wrap:opacity-100">
            <button
              type="button"
              aria-label={`Rename point ${wrapper.title}`}
              title="Rename point"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                setEditingCard(wrapper.id);
              }}
              className="flex h-5 w-5 items-center justify-center rounded text-text-muted hover:bg-surface-sunken hover:text-foreground"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              aria-label={`Delete point ${wrapper.title}`}
              title="Delete point — its arguments go with it"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                openModal({ kind: "deleteWrapper", wrapperId: wrapper.id });
              }}
              className="flex h-5 w-5 items-center justify-center rounded text-text-muted hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </span>

          <button
            type="button"
            aria-label={wrapper.collapsed ? "Expand point" : "Collapse point"}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              toggleWrapperCollapsed(wrapper.id);
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-muted hover:bg-surface-sunken hover:text-foreground"
          >
            {wrapper.collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        {!wrapper.collapsed && (
          <div className="py-0 pl-2 pr-0">
            {members.length === 0 && (
              // A brand-new Point is empty, and its only sensible next move
              // is its first argument — so the offer lives in the body
              // rather than making the reader hunt for it. Every argument
              // after this one comes from that argument's own "Add New".
              <div className="my-2 mr-2 flex flex-col items-center gap-2 rounded-md border border-dashed border-border-default px-2 py-4">
                <p className="text-center text-[11px] text-text-muted">
                  Nothing under this point yet.
                </p>
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    const noteId = addNoteInWrapper(wrapper.id);
                    setEditingCard(noteId);
                  }}
                  className="flex items-center gap-1 rounded-md border border-border-default bg-surface-overlay px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-surface-sunken"
                >
                  <Plus className="h-3 w-3" />
                  Create argument
                </button>
              </div>
            )}
            {/*
              The rule sits UNDER each argument's action row, so it reads as
              the boundary between one argument and the next. The last one
              drops it — otherwise it would double up with the Point's own
              bottom edge.
            */}
            {members.map((card) => (
              <div key={card.id} className="border-b border-border-subtle last:border-b-0">
                <CanvasCard
                  card={card}
                  position={{ x: 0, y: 0 }}
                  selectedIds={selectedIds}
                  draggingCardId={draggingCardId}
                  onStartDrag={onStartDrag}
                  onSelect={onSelectCard}
                  inWrapper
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
