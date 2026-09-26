/**
 * Right pane: the workspace the reader assembles while reading.
 *
 * Cards live in an unscaled coordinate space and the surface is CSS-scaled by
 * the zoom, so stored positions stay stable across zoom changes. Only cards
 * placed on the canvas appear here — comments still docked on the reader's
 * seam are drawn by `MarginNoteLayer` until they are dragged across.
 */

import {
  Check,
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  GripVertical,
  Link2,
  Minus,
  Plus,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/lib/sonner";

import { useNarrowLayout } from "../hooks/use-narrow-layout";
import { cn } from "@/lib/utils";

import { CANVAS_ZOOM_MAX, CANVAS_ZOOM_MIN } from "../constants";
import { useCardDrag } from "../hooks/use-card-drag";
import { useLiquidTextStore } from "../stores/liquid-text-store";
import { useLiquidTextUiStore } from "../stores/liquid-text-ui-store";
import type { NoteWrapper, WorkspaceCard } from "../types";
import { readDragPayload } from "../utils/drag-payload";
import { CanvasCard } from "./canvas-card";
import { NoteWrapperView } from "./note-wrapper";
import type { PresenterSync } from "../api/use-presenter-sync";
import { PointPager } from "./point-pager";
import { SyncStatus } from "./sync-status";

interface WorkspaceCanvasProps {
  /**
   * Shown beside the case name. It lives here because this header is the one
   * strip of Presenter that is always on screen — a save warning the reader
   * has to scroll to find is not a warning.
   */
  sync: PresenterSync;
}

export function WorkspaceCanvas({ sync }: WorkspaceCanvasProps) {
  const project = useLiquidTextStore((state) => state.project);
  const projectName = useLiquidTextStore((state) => state.project.name);
  const activeWorkspaceId = useLiquidTextStore((state) => state.activeWorkspaceId);
  const promoteCardToCanvas = useLiquidTextStore((state) => state.promoteCardToCanvas);
  const addWrapper = useLiquidTextStore((state) => state.addWrapper);
  const moveWrapper = useLiquidTextStore((state) => state.moveWrapper);
  const assignCardToWrapper = useLiquidTextStore((state) => state.assignCardToWrapper);

  const canvasZoom = useLiquidTextUiStore((state) => state.canvasZoom);
  const zoomIn = useLiquidTextUiStore((state) => state.zoomIn);
  const zoomOut = useLiquidTextUiStore((state) => state.zoomOut);
  const canvasCollapsed = useLiquidTextUiStore((state) => state.canvasCollapsed);
  const railCollapsed = useLiquidTextUiStore((state) => state.railCollapsed);
  const canvasWidth = useLiquidTextUiStore((state) => state.canvasWidth);
  const setCanvasWidth = useLiquidTextUiStore((state) => state.setCanvasWidth);
  const isNarrow = useNarrowLayout();
  const [isResizing, setIsResizing] = useState(false);
  const toggleCanvas = useLiquidTextUiStore((state) => state.toggleCanvas);
  const selectedCardIds = useLiquidTextUiStore((state) => state.selectedCardIds);
  const selectCard = useLiquidTextUiStore((state) => state.selectCard);
  const clearCardSelection = useLiquidTextUiStore((state) => state.clearCardSelection);

  const sectionRef = useRef<HTMLElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  /**
   * Drag the divider between the reader and the workspace.
   *
   * The first drag seeds from the pane's *measured* width, not from
   * `canvasWidth` — until someone drags, the pane is sized by a responsive
   * class and the stored value is null, so reading state would start the
   * drag from zero and make the pane jump.
   */
  const startResize = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = sectionRef.current?.getBoundingClientRect().width ?? 0;

      function onMove(moveEvent: MouseEvent) {
        // Dragging left grows the workspace, so the delta is inverted.
        setCanvasWidth(startWidth - (moveEvent.clientX - startX));
      }
      function onUp() {
        setIsResizing(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      }

      setIsResizing(true);
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [setCanvasWidth],
  );
  const [dropActive, setDropActive] = useState(false);
  const setEditingCard = useLiquidTextUiStore((state) => state.setEditingCard);
  const linkingPassage = useLiquidTextUiStore((state) => state.linkingPassage);
  const stopLinking = useLiquidTextUiStore((state) => state.stopLinking);

  // Escape abandons a pick started by mistake, wherever the focus is.
  useEffect(() => {
    if (!linkingPassage) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") stopLinking();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [linkingPassage, stopLinking]);

  const activeWrapperId = useLiquidTextUiStore((state) => state.activeWrapperId);
  const setActiveWrapper = useLiquidTextUiStore((state) => state.setActiveWrapper);
  const { startDrag, draggingCardId, dragPosition } = useCardDrag({
    zoom: canvasZoom,
    surfaceRef,
    onDropOnWrapper: (cardId, wrapperId) => {
      assignCardToWrapper(cardId, wrapperId);
      toast.success("Filed under the point");
    },
  });

  // Wrapper drag mirrors card drag: local position while the pointer is
  // down, one store write on release so the undo stack sees one move.
  const [wrapperDrag, setWrapperDrag] = useState<null | {
    wrapperId: string;
    grabX: number;
    grabY: number;
    x: number;
    y: number;
  }>(null);
  const wrapperDragRef = useRef(wrapperDrag);
  wrapperDragRef.current = wrapperDrag;

  const startWrapperDrag = (event: React.PointerEvent, wrapper: NoteWrapper) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const bounds = surface.getBoundingClientRect();
    setWrapperDrag({
      wrapperId: wrapper.id,
      grabX: (event.clientX - bounds.left) / canvasZoom - wrapper.x,
      grabY: (event.clientY - bounds.top) / canvasZoom - wrapper.y,
      x: wrapper.x,
      y: wrapper.y,
    });
  };

  useEffect(() => {
    if (!wrapperDrag) return undefined;
    function onMove(event: PointerEvent) {
      const surface = surfaceRef.current;
      const current = wrapperDragRef.current;
      if (!surface || !current) return;
      const bounds = surface.getBoundingClientRect();
      setWrapperDrag({
        ...current,
        x: Math.max(0, (event.clientX - bounds.left) / canvasZoom - current.grabX),
        y: Math.max(0, (event.clientY - bounds.top) / canvasZoom - current.grabY),
      });
    }
    function onUp() {
      const current = wrapperDragRef.current;
      if (current) moveWrapper(current.wrapperId, Math.round(current.x), Math.round(current.y));
      setWrapperDrag(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [wrapperDrag, canvasZoom, moveWrapper]);

  const workspace =
    project.workspaces.find((entry) => entry.id === activeWorkspaceId) ?? project.workspaces[0];
  const cards = workspace?.cards ?? [];
  const wrappers = workspace?.wrappers ?? [];
  const canvasCards = cards.filter(
    (card) => card.placement === "canvas" && card.wrapperId === null,
  );
  const membersOf = (wrapperId: string) => cards.filter((card) => card.wrapperId === wrapperId);

  // One Point on screen at a time. With nothing selected — first load, or
  // after the selected one is deleted — fall back to the first rather than
  // rendering an empty canvas beside a populated strip.
  const activeWrapper =
    wrappers.find((wrapper) => wrapper.id === activeWrapperId) ?? wrappers[0] ?? null;
  const visibleWrappers = activeWrapper ? [activeWrapper] : [];

  function handleCardClick(event: React.MouseEvent, cardId: string) {
    event.stopPropagation();
    selectCard(cardId, event.shiftKey || event.metaKey);
  }

  function positionOf(card: WorkspaceCard) {
    return draggingCardId === card.id && dragPosition ? dragPosition : { x: card.x, y: card.y };
  }

  /** Where a native drop landed, in unscaled canvas coordinates. */
  function dropPoint(event: React.DragEvent) {
    const surface = surfaceRef.current;
    if (!surface) return { x: 48, y: 48 };
    const bounds = surface.getBoundingClientRect();
    return {
      x: Math.max(0, (event.clientX - bounds.left) / canvasZoom - 120),
      y: Math.max(0, (event.clientY - bounds.top) / canvasZoom - 20),
    };
  }

  function handleDrop(event: React.DragEvent) {
    setDropActive(false);
    const payload = readDragPayload(event.dataTransfer);
    if (!payload) return;
    event.preventDefault();

    const point = dropPoint(event);
    const wrapperId =
      document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-wrapper-id]")?.dataset.wrapperId ?? null;

    promoteCardToCanvas(payload.cardId, point.x, point.y);
    if (wrapperId) assignCardToWrapper(payload.cardId, wrapperId);
    toast.success(wrapperId ? "Comment filed under the point" : "Comment moved to the workspace");
  }

  if (canvasCollapsed) {
    return (
      <div className="flex w-full shrink-0 flex-col items-center gap-2 border-l border-border-subtle bg-surface-sunken py-3 lg:w-10">
        <button
          type="button"
          onClick={toggleCanvas}
          aria-label="Expand workspace"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-raised hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="rotate-180 whitespace-nowrap text-[10px] uppercase tracking-widest text-text-muted [writing-mode:vertical-rl]">
          Workspace · {cards.length}
        </span>
      </div>
    );
  }

  return (
    <section
      ref={sectionRef}
      data-lt-canvas=""
      /*
        A dragged width is a desktop measurement. Applied on a phone it would
        beat the `w-full` class and leave the canvas cut off or overflowing,
        so the pane stays fluid there and the drag is remembered for the wide
        layout it was made in.
      */
      style={
        canvasWidth === null || isNarrow ? undefined : { width: canvasWidth, maxWidth: "none" }
      }
      className={cn(
        "relative flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden border-l border-border-subtle bg-surface-base lg:min-w-[320px]",
        // Until the divider is dragged the pane is responsive: closing the
        // documents rail is the reader saying they are done picking documents
        // and are working on the argument now, so the canvas takes the larger
        // share (reader 3, canvas 4). A drag replaces this with a fixed width.
        canvasWidth === null && (railCollapsed ? "lg:w-[57.1428%]" : "lg:w-[36%] lg:max-w-[520px]"),
        isResizing && "select-none",
      )}
    >
      {/* Divider, shared with the reader — grab anywhere along the seam. */}
      <button
        type="button"
        onMouseDown={startResize}
        onDoubleClick={() => setCanvasWidth(null)}
        title="Drag to resize · double-click to reset"
        aria-label="Resize the reader and workspace split"
        className="group absolute inset-y-0 -left-1.5 z-30 hidden w-3 cursor-col-resize items-center justify-center lg:flex"
      >
        <GripVertical
          className={cn(
            "h-8 w-4 rounded-full bg-surface-raised text-text-muted opacity-0 shadow-sm transition-opacity group-hover:opacity-100",
            isResizing && "opacity-100",
          )}
        />
      </button>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-raised px-3">
        <span className="truncate text-xs font-semibold text-foreground">
          {/* The case is what the reader is in; there is no board above the
              Points to name. */}
          {projectName || "Workspace"}
        </span>

        <SyncStatus sync={sync} />

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const wrapperId = addWrapper("New point");
              setActiveWrapper(wrapperId);
              setEditingCard(wrapperId);
            }}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface-sunken hover:text-foreground"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            Point
          </button>
          <button
            type="button"
            onClick={toggleCanvas}
            aria-label="Collapse workspace"
            className="flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-surface-sunken hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/*
        The passage is picked and waiting: every argument below is wearing a
        checkbox until this bar goes away. It stays up while the reader ticks
        several, because one passage often belongs to more than one argument.
      */}
      {linkingPassage && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-brand-subtle px-3 py-1.5">
          <Link2 className="h-3.5 w-3.5 shrink-0 text-brand-subtle-foreground" />
          <p className="min-w-0 flex-1 text-[11px] text-brand-subtle-foreground">
            Tick the arguments this passage belongs to — p.{linkingPassage.pageNumber}.
          </p>
          <button
            type="button"
            onClick={stopLinking}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-brand-subtle-foreground hover:bg-surface-overlay"
          >
            <Check className="h-3 w-3" />
            Done
          </button>
        </div>
      )}

      <PointPager wrappers={wrappers} activeWrapperId={activeWrapper?.id ?? null} />

      <div
        className={cn(
          "relative min-h-0 flex-1 overflow-auto bg-[radial-gradient(var(--color-border-subtle)_1px,transparent_1px)] [background-size:18px_18px]",
          dropActive && "ring-2 ring-inset ring-primary/60",
        )}
        onClick={clearCardSelection}
        onDragOver={(event) => {
          // Accepting the drop here is what makes the cursor say "move" while
          // a comment is over the canvas.
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          if (!dropActive) setDropActive(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDropActive(false);
          }
        }}
        onDrop={handleDrop}
      >
        <div
          ref={surfaceRef}
          style={{
            transform: `scale(${canvasZoom})`,
            transformOrigin: "top left",
            width: `${100 / canvasZoom}%`,
            minHeight: `${100 / canvasZoom}%`,
          }}
          className="relative"
        >
          {/* A wrapper counts as something here, even before it holds a note. */}
          {canvasCards.length === 0 && wrappers.length === 0 && cards.length === 0 && (
            <div className="pointer-events-none absolute inset-x-6 top-16 text-center">
              <p className="text-sm font-medium text-foreground">Nothing here yet</p>
              <p className="mx-auto mt-1 max-w-xs text-xs text-text-muted">
                Select a passage on the left and choose <strong>AutoExcerpt</strong>, or add a note
                to start building your argument.
              </p>
            </div>
          )}

          {/*
            One Point at a time, placing a passage or not — a canvas of
            stacked Points stops being readable well before a matter has ten
            of them. A passage waiting to be placed survives a change of
            Point, so reaching an argument under another number is a click on
            the strip above, not a reason to put every Point on screen.
          */}
          <div>
            {visibleWrappers.map((wrapper) => (
              <NoteWrapperView
                key={wrapper.id}
                wrapper={wrapper}
                members={membersOf(wrapper.id)}
                position={
                  wrapperDrag?.wrapperId === wrapper.id
                    ? { x: wrapperDrag.x, y: wrapperDrag.y }
                    : { x: wrapper.x, y: wrapper.y }
                }
                selectedIds={selectedCardIds}
                draggingCardId={draggingCardId}
                onStartDrag={(event, target) => startDrag(event, target.id, target.x, target.y)}
                onStartWrapperDrag={startWrapperDrag}
                onSelectCard={handleCardClick}
              />
            ))}

            {canvasCards.map((card) => (
              <CanvasCard
                key={card.id}
                card={card}
                position={positionOf(card)}
                selectedIds={selectedCardIds}
                draggingCardId={draggingCardId}
                onStartDrag={(event, target) => startDrag(event, target.id, target.x, target.y)}
                onSelect={handleCardClick}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Zoom rail */}
      <div className="absolute bottom-4 right-3 z-30 flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-overlay shadow-elevation-raised">
        <button
          type="button"
          onClick={zoomIn}
          disabled={canvasZoom >= CANVAS_ZOOM_MAX}
          aria-label="Zoom in"
          className="flex h-9 w-9 items-center justify-center text-text-secondary hover:bg-surface-sunken disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
        </button>
        <span className="border-y border-border-subtle px-1 py-1 text-center text-[10px] text-text-muted">
          {Math.round(canvasZoom * 100)}%
        </span>
        <button
          type="button"
          onClick={zoomOut}
          disabled={canvasZoom <= CANVAS_ZOOM_MIN}
          aria-label="Zoom out"
          className="flex h-9 w-9 items-center justify-center text-text-secondary hover:bg-surface-sunken disabled:opacity-40"
        >
          <Minus className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
