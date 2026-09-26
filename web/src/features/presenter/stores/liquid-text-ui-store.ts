/**
 * Chrome state for the LiquidText workspace: which tool is armed, which
 * panel is open, what is selected, how far the document is collapsed.
 *
 * Kept separate from `liquid-text-store` on purpose — undo/redo should step
 * through the user's *work*, not through panel toggles, and these two stores
 * have completely different lifetimes.
 */

import { create } from "zustand";

import {
  CANVAS_MAX_WIDTH,
  CANVAS_MIN_WIDTH,
  CANVAS_ZOOM_MAX,
  CANVAS_ZOOM_MIN,
  DEFAULT_HIGHLIGHT_COLOR,
} from "../constants";
import type { HighlightColor, PanelId, PassageAnchor, ReaderSelection } from "../types";
import { clamp } from "../utils/geometry";

/**
 * A passage the reader has picked out and is now choosing arguments for.
 *
 * Held here rather than on a card because at this point it belongs to no
 * card yet — it is the reader's pointer, waiting for however many arguments
 * they tick.
 */
export interface PendingPassage extends PassageAnchor {
  documentId: string;
}

/** Modal dialogs. One at a time; `null` means none is open. */
export type ModalState =
  | null
  | { kind: "renameDocument"; documentId: string }
  | { kind: "deleteDocument"; documentId: string }
  | { kind: "addDocument" }
  | { kind: "deleteCard"; cardId: string }
  | { kind: "deleteWrapper"; wrapperId: string }
  | { kind: "deleteLink"; cardId: string; linkId: string };

/**
 * Which pane fills a narrow screen.
 *
 * The three panes sit side by side from `lg` up. Below that there is not
 * enough width for even two, so one shows at a time and this says which.
 * Ignored entirely on a wide screen — the panes are all mounted there.
 */
export type MobilePane = "documents" | "reader" | "workspace";

interface LiquidTextUiState {
  mobilePane: MobilePane;
  railCollapsed: boolean;
  canvasCollapsed: boolean;
  highlightViewOpen: boolean;
  panel: PanelId;
  modal: ModalState;

  setMobilePane: (pane: MobilePane) => void;

  /** Reader */
  selection: ReaderSelection | null;
  activeColor: HighlightColor;
  /** Highlight whose edit popover is open in the reader. */
  activeHighlightId: string | null;
  /**
   * Highlight being re-drawn. While set, the reader's next selection becomes
   * the highlight's new extent instead of opening the selection toolbar —
   * editing a highlight is the same gesture as making one.
   */
  reshapingHighlightId: string | null;
  focusedParagraphId: string | null;
  /**
   * Where the reader's last connection landed. "Back to document" from the
   * linked view resumes here instead of wherever the document happened to
   * be scrolled — the reader just placed this link and wants to keep
   * reading forward from it.
   */
  lastConnectedAnchor: { documentId: string; paragraphId: string } | null;
  /**
   * Set while the reader is choosing which arguments a passage belongs to.
   * Every argument grows a checkbox for as long as this is non-null.
   */
  linkingPassage: PendingPassage | null;

  /** Documents rail */
  documentFilter: string;

  /** Canvas */
  canvasZoom: number;
  /**
   * Width of the workspace pane in pixels once the reader has dragged the
   * divider. `null` means "unset" — the pane keeps its responsive default
   * (which also carries the wider share when the documents rail is closed),
   * so dragging is an override rather than the only sizing mechanism.
   */
  canvasWidth: number | null;
  /**
   * Which Point the workspace is showing. One at a time, chosen from the
   * numbered strip — a canvas of stacked Points stops being readable well
   * before a matter has ten of them.
   */
  activeWrapperId: string | null;
  /** First Point index in the visible run of numbered tabs. */
  pointWindowStart: number;
  selectedCardIds: string[];
  editingCardId: string | null;
  /** Card whose connector should pulse — set when a search hit is opened. */
  spotlightCardId: string | null;
  /**
   * Cards whose connectors are drawn. Empty by default: a line per card turns
   * the workspace into a cat's cradle, so a card shows its thread only when
   * the reader asks for it via the arrow tab on its left edge.
   */
  connectorCardIds: string[];
  /**
   * The reference whose line is drawn, as `cardId:linkId`.
   *
   * A card's connectors used to be all-or-nothing, so opening one reference
   * lit every line the card had. Kept here rather than on the card because
   * one reference shows at a time across the whole workspace — two cards
   * each with a line open is the cat's cradle the notches exist to avoid.
   */
  openLinkKey: string | null;

  /** Search */
  searchQuery: string;
  searchHitIndex: number;

  toggleRail: () => void;
  toggleCanvas: () => void;
  toggleHighlightView: () => void;
  openPanel: (panel: PanelId) => void;
  closePanel: () => void;
  openModal: (modal: NonNullable<ModalState>) => void;
  closeModal: () => void;

  setSelection: (selection: ReaderSelection | null) => void;
  setActiveColor: (color: HighlightColor) => void;
  setActiveHighlight: (highlightId: string | null) => void;
  setReshapingHighlight: (highlightId: string | null) => void;
  setLastConnectedAnchor: (anchor: { documentId: string; paragraphId: string } | null) => void;
  startLinking: (passage: PendingPassage) => void;
  stopLinking: () => void;
  focusParagraph: (paragraphId: string | null) => void;

  setDocumentFilter: (filter: string) => void;

  setCanvasZoom: (zoom: number) => void;
  setCanvasWidth: (width: number | null) => void;
  setActiveWrapper: (wrapperId: string | null) => void;
  setPointWindowStart: (start: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  selectCard: (cardId: string, additive: boolean) => void;
  clearCardSelection: () => void;
  setEditingCard: (cardId: string | null) => void;
  spotlightCard: (cardId: string | null) => void;
  toggleConnector: (cardId: string) => void;
  setOpenLinkKey: (key: string | null) => void;
  hideAllConnectors: () => void;

  setSearchQuery: (query: string) => void;
  setSearchHitIndex: (index: number) => void;
}

export const useLiquidTextUiStore = create<LiquidTextUiState>((set) => ({
  // Documents first: on a phone the case opens on its contents, which is the
  // one pane that is useful before anything has been picked.
  mobilePane: "documents",
  railCollapsed: false,
  canvasCollapsed: false,
  highlightViewOpen: false,
  panel: null,
  modal: null,

  selection: null,
  activeColor: DEFAULT_HIGHLIGHT_COLOR,
  activeHighlightId: null,
  reshapingHighlightId: null,
  focusedParagraphId: null,
  lastConnectedAnchor: null,
  linkingPassage: null,

  documentFilter: "",

  canvasZoom: 1,
  canvasWidth: null,
  activeWrapperId: null,
  pointWindowStart: 0,
  selectedCardIds: [],
  editingCardId: null,
  spotlightCardId: null,
  connectorCardIds: [],
  openLinkKey: null,

  searchQuery: "",
  searchScope: "documents",
  searchRange: "current",
  searchHitIndex: 0,

  setMobilePane: (mobilePane) => set({ mobilePane }),
  toggleRail: () => set((state) => ({ railCollapsed: !state.railCollapsed })),
  toggleCanvas: () => set((state) => ({ canvasCollapsed: !state.canvasCollapsed })),
  toggleHighlightView: () =>
    set((state) => ({ highlightViewOpen: !state.highlightViewOpen, selection: null })),
  openPanel: (panel) => set({ panel }),
  closePanel: () => set({ panel: null }),
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),

  setSelection: (selection) => set({ selection }),
  setActiveColor: (activeColor) => set({ activeColor }),
  setActiveHighlight: (activeHighlightId) => set({ activeHighlightId }),
  // Opening the re-draw closes the popover it was started from: the reader
  // is looking at the text now, not at the card of controls over it.
  setReshapingHighlight: (reshapingHighlightId) =>
    set({ reshapingHighlightId, activeHighlightId: null, selection: null }),
  focusParagraph: (focusedParagraphId) => set({ focusedParagraphId }),
  setLastConnectedAnchor: (lastConnectedAnchor) => set({ lastConnectedAnchor }),
  // Picking a passage clears the selection toolbar: the passage is captured
  // now, and leaving the bar up over the text invites a second pick.
  startLinking: (linkingPassage) => set({ linkingPassage, selection: null }),
  stopLinking: () => set({ linkingPassage: null }),

  setDocumentFilter: (documentFilter) => set({ documentFilter }),

  setCanvasZoom: (zoom) => set({ canvasZoom: clamp(zoom, CANVAS_ZOOM_MIN, CANVAS_ZOOM_MAX) }),
  setCanvasWidth: (width) =>
    set({ canvasWidth: width === null ? null : clamp(width, CANVAS_MIN_WIDTH, CANVAS_MAX_WIDTH) }),
  setActiveWrapper: (activeWrapperId) =>
    set((state) => {
      if (state.activeWrapperId === activeWrapperId) return { activeWrapperId };
      return { activeWrapperId, connectorCardIds: [], openLinkKey: null };
    }),
  setPointWindowStart: (pointWindowStart) =>
    set({ pointWindowStart: Math.max(0, pointWindowStart) }),
  zoomIn: () =>
    set((state) => ({
      canvasZoom: clamp(state.canvasZoom + 0.1, CANVAS_ZOOM_MIN, CANVAS_ZOOM_MAX),
    })),
  zoomOut: () =>
    set((state) => ({
      canvasZoom: clamp(state.canvasZoom - 0.1, CANVAS_ZOOM_MIN, CANVAS_ZOOM_MAX),
    })),

  selectCard: (cardId, additive) =>
    set((state) => {
      if (!additive) return { selectedCardIds: [cardId] };
      return {
        selectedCardIds: state.selectedCardIds.includes(cardId)
          ? state.selectedCardIds.filter((id) => id !== cardId)
          : [...state.selectedCardIds, cardId],
      };
    }),
  clearCardSelection: () => set({ selectedCardIds: [] }),
  setEditingCard: (editingCardId) => set({ editingCardId }),
  spotlightCard: (spotlightCardId) => set({ spotlightCardId }),
  toggleConnector: (cardId) =>
    set((state) => ({
      connectorCardIds: state.connectorCardIds.includes(cardId)
        ? state.connectorCardIds.filter((id) => id !== cardId)
        : [...state.connectorCardIds, cardId],
    })),
  setOpenLinkKey: (openLinkKey) => set({ openLinkKey }),
  hideAllConnectors: () => set({ connectorCardIds: [], openLinkKey: null }),

  setSearchQuery: (searchQuery) => set({ searchQuery, searchHitIndex: 0 }),
  setSearchHitIndex: (searchHitIndex) => set({ searchHitIndex }),
}));
