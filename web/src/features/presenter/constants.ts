/**
 * Static configuration for the LiquidText workspace: the highlight palette
 * and the fixed geometry the reader/canvas share.
 *
 * Highlight colours are deliberately NOT the app's semantic tokens — they
 * are ink colours the user picks by name (the same seven swatches as the
 * source product), so they live here as an explicit table rather than
 * being derived from `@/lib/tokens`. Everything else in the feature uses
 * semantic Tailwind classes.
 */

import type { HighlightColor } from "./types";

/**
 * NOTE: opacity modifiers must be a multiple of 5 — Tailwind's opacity scale
 * is 0,5,…,100 and an off-scale value like `/32` silently generates no rule
 * at all, which is how blue, magenta and cyan once shipped with no highlight
 * background while the others worked.
 */
interface SwatchStyle {
  label: string;
  /** Filled circle in the palette row. */
  swatch: string;
  /** Applied to highlighted runs of text in the reader. */
  mark: string;
  /** Left accent bar on excerpt/note cards and HighlightView rows. */
  bar: string;
  /** Card border when the card carries this colour. */
  border: string;
  /** Stroke for SVG connectors leaving a card of this colour. */
  stroke: string;
}

export const HIGHLIGHT_STYLES: Record<HighlightColor, SwatchStyle> = {
  red: {
    label: "Red",
    swatch: "bg-[#f2453d]",
    mark: "bg-[#f2453d]/35 dark:bg-[#f2453d]/40",
    bar: "bg-[#f2453d]",
    border: "border-[#f2453d]",
    stroke: "#f2453d",
  },
  green: {
    label: "Green",
    swatch: "bg-[#3ec46d]",
    mark: "bg-[#3ec46d]/35 dark:bg-[#3ec46d]/40",
    bar: "bg-[#3ec46d]",
    border: "border-[#3ec46d]",
    stroke: "#3ec46d",
  },
  blue: {
    label: "Blue",
    swatch: "bg-[#5b6ee0]",
    mark: "bg-[#5b6ee0]/35 dark:bg-[#5b6ee0]/40",
    bar: "bg-[#5b6ee0]",
    border: "border-[#5b6ee0]",
    stroke: "#5b6ee0",
  },
  yellow: {
    label: "Yellow",
    swatch: "bg-[#f5c518]",
    mark: "bg-[#f5c518]/45 dark:bg-[#f5c518]/40",
    bar: "bg-[#f5c518]",
    border: "border-[#f5c518]",
    stroke: "#f5c518",
  },
  magenta: {
    label: "Magenta",
    swatch: "bg-[#e355b6]",
    mark: "bg-[#e355b6]/35 dark:bg-[#e355b6]/40",
    bar: "bg-[#e355b6]",
    border: "border-[#e355b6]",
    stroke: "#e355b6",
  },
  cyan: {
    label: "Cyan",
    swatch: "bg-[#3ec8d8]",
    mark: "bg-[#3ec8d8]/35 dark:bg-[#3ec8d8]/40",
    bar: "bg-[#3ec8d8]",
    border: "border-[#3ec8d8]",
    stroke: "#3ec8d8",
  },
  clear: {
    label: "No colour",
    swatch: "border border-border-strong bg-surface-raised",
    mark: "",
    bar: "bg-border-strong",
    border: "border-border-default",
    stroke: "#94a3b8",
  },
};

/** Palette row order — `clear` sits sixth, matching the source product. */
export const PALETTE_ORDER: readonly HighlightColor[] = [
  "red",
  "green",
  "blue",
  "yellow",
  "magenta",
  "clear",
  "cyan",
];

/** Colour applied when the user excerpts without picking a swatch first. */
export const DEFAULT_HIGHLIGHT_COLOR: HighlightColor = "yellow";

// ── Canvas geometry ─────────────────────────────────────────────────────────

export const CARD_DEFAULT_WIDTH = 380;
/** Where a newly created card lands when nothing was dropped explicitly. */
export const CARD_SPAWN_ORIGIN = { x: 48, y: 48 };
/** Each subsequent auto-placed card steps down-right by this much. */
export const CARD_SPAWN_STEP = 26;

/**
 * Bounds for the draggable reader/workspace split. Below the minimum a card
 * column stops being usable; above the maximum the document is squeezed to
 * nothing, which is the wrong trade in a reading tool.
 */
/**
 * The page's own width, in CSS pixels, before the reader pane scales it.
 *
 * The document is laid out once at this width and then scaled to fit the
 * pane. Dragging the divider therefore resizes the *page* — the line breaks,
 * the shape of every paragraph and where a highlight sits in it all stay put,
 * which is what makes a passage recognisable after a resize. Reflowing to the
 * pane instead re-broke every line and moved the words under the reader's eye.
 */
export const READER_PAGE_WIDTH = 720;

/** How far the page may be scaled before it stops being worth reading. */
export const READER_PAGE_SCALE_MIN = 0.45;
export const READER_PAGE_SCALE_MAX = 2;

/** Breathing room either side of the page inside the reader's scroller. */
export const READER_PAGE_GUTTER = 48;

/**
 * Where a new Point lands. Fixed rather than cascading: the workspace shows
 * one Point at a time, so a new one belongs at the top of the canvas where
 * the reader is already looking.
 */
export const WRAPPER_SPAWN_ORIGIN = { x: 12, y: 16 };

/** Numbered Point tabs shown at once before Prev/Next page the strip. */
export const POINTS_PER_PAGE = 10;

/**
 * Numbered document chips shown at once on an argument reference before the
 * strip pages. Three, because the chips sit inside the reference column of a
 * card — narrow enough that a fourth would either wrap or shrink the label.
 */
export const LINK_DOCS_PER_PAGE = 3;

export const CANVAS_MIN_WIDTH = 320;
export const CANVAS_MAX_WIDTH = 900;

export const CANVAS_ZOOM_MIN = 0.5;
export const CANVAS_ZOOM_MAX = 1.6;

/**
 * Endpoint dot on a connector. Shared with `use-connector-anchors`, which
 * backs the card-side anchor off by exactly this much so the dot comes to
 * rest against the notch's border rather than on top of it.
 */
export const CONNECTOR_DOT_RADIUS = 3.5;

/** Undo/redo ring size. Deep enough for a working session, bounded for memory. */
export const HISTORY_LIMIT = 50;

/**
 * Reader → canvas drags travel as JSON on `text/plain`.
 *
 * Custom dataTransfer types are unreadable during `dragover` in Safari, which
 * is exactly when the canvas needs to decide whether to accept the drop, so
 * the payload rides on `text/plain` and is identified by this marker instead.
 */
export const DRAG_PAYLOAD_MARKER = "liquidtext/v1";

/**
 * Comment cards straddle the seam between the reader and the workspace —
 * half over the page, half over the canvas — so the gesture of dragging one
 * across reads as finishing a move it has already started.
 */
export const MARGIN_CARD_WIDTH = 210;
/** Minimum vertical gap between two comment cards before they get pushed apart. */
export const MARGIN_CARD_GAP = 8;
