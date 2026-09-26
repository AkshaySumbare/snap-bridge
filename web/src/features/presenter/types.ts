/**
 * Domain model for the LiquidText workspace.
 *
 * The shapes the reader works in. Server wire shapes live in
 * `schemas/presenter.schema.ts` and are mapped across in `api/mappers.ts` —
 * the two differ on purpose, most visibly over canvas layout, which the
 * reader keeps and the server does not store.
 */

// ── Palette ─────────────────────────────────────────────────────────────────

/** The seven swatches on the selection/card toolbars. `clear` erases. */
export type HighlightColor = "red" | "green" | "blue" | "yellow" | "magenta" | "cyan" | "clear";

// ── Documents ───────────────────────────────────────────────────────────────

export type DocumentKind = "pdf" | "docx" | "webpage";

/** One block of body text. Offsets in `Highlight` are relative to `text`. */
/**
 * Where one line of a paragraph sits on the page.
 *
 * `start`/`end` are character offsets into the paragraph's own text — the same
 * units a Highlight is stored in — and `bbox` is `[x0, y0, x1, y1]` as
 * fractions of the page, so it survives any zoom. Together they are what lets
 * text be laid over a rendered page at exactly the right place.
 */
export interface TextRun {
  start: number;
  end: number;
  bbox: [number, number, number, number];
}

export interface DocumentParagraph {
  id: string;
  /** Leading marker rendered in the margin-ish position, e.g. "B." or "(a)". */
  label?: string;
  text: string;
  /** Centred + bold, used for "AGREEMENT AND PLAN OF MERGER" style banners. */
  heading?: boolean;
  /** Renders indented, for sub-clauses. */
  indent?: 0 | 1 | 2;
  /**
   * Line boxes on the rendered page. Absent for anything the parser could not
   * place, which then falls back to being typeset rather than overlaid.
   */
  runs?: TextRun[];
}

export interface DocumentPage {
  number: number;
  paragraphs: DocumentParagraph[];
}

/**
 * How far the server has got with reading a PDF.
 *
 * `stalled` is not a stored state — it is derived on read, from a claim older
 * than the timeout. A parse whose process died would otherwise sit at
 * `running` forever, which on screen is a spinner that never stops.
 */
export type ParseStatus = "pending" | "running" | "ready" | "failed" | "stalled";

export interface DocumentParse {
  status: ParseStatus;
  /** Total pages in the file, known as soon as the server opens it. */
  pageCount: number;
  /** Pages read so far, out of `pageCount`. */
  pagesDone: number;
  /**
   * True for failed and stalled. Never runs out: nothing retries by itself,
   * so a document that will not open stays askable however many times it has
   * been asked.
   */
  canRetry: boolean;
  error: string | null;
}

export interface LiquidDocument {
  id: string;
  title: string;
  kind: DocumentKind;
  /** Folder grouping in the Documents rail. `null` = top level. */
  folderId: string | null;
  ocrComplete: boolean;
  visibleToCollaborators: boolean;
  /**
   * Extraction state. The rail shows it, and the page fetch waits on it —
   * asking for the pages of a document that has not been read yet returns
   * nothing and would be recorded as "already fetched".
   */
  parse: DocumentParse;
  pages: DocumentPage[];
}

// ── Annotations ─────────────────────────────────────────────────────────────

export interface Highlight {
  id: string;
  documentId: string;
  pageNumber: number;
  paragraphId: string;
  /** Character offsets into `DocumentParagraph.text`; `end` is exclusive. */
  start: number;
  end: number;
  color: HighlightColor;
  /** Denormalised so excerpt cards and search need no paragraph lookup. */
  text: string;
  createdAt: string;
}

/**
 * A point the reader dropped inside a paragraph.
 *
 * Stored as a ratio of the paragraph's own box rather than a page coordinate,
 * so the dot stays on the words it was placed against when the document is
 * re-laid out — a paragraph that reflows, or gets folded into a seam, carries
 * its anchors with it.
 */
export interface PassageAnchor {
  paragraphId: string;
  pageNumber: number;
  /** 0–1 within the paragraph's box. */
  ratioX: number;
  ratioY: number;
}

/**
 * A passage a card points at, plus the reference it was filed under.
 *
 * Passages are attached to an argument's references — "ref to 1", "cl. 4.2" —
 * rather than to the argument as a whole, because that is the unit the reader
 * writes and thinks in. `linkId` is null for connections made before there
 * were references to hang them on.
 */
export interface CardConnection extends PassageAnchor {
  /**
   * The node id, once the server has one for this passage.
   *
   * Connections are the only node the canvas models positionally — a passage
   * lives inside a card's array — so locally-made ones fall back to an id
   * derived from `(card, reference, index)`. That derivation is stable only
   * while the index is: re-pointing a reference shifted every later passage's
   * id, so the push read as "delete these, create those" and passages a
   * colleague could see were tombstoned on the server.
   *
   * Anything that has been through the server carries its real id here, and
   * keeping it is what makes an edit an update rather than a delete and a
   * duplicate.
   */
  id?: string;
  linkId: string | null;
  /**
   * The document the passage is in.
   *
   * Taken from the passage, never from the card: one argument can point at
   * clauses in three different documents, and a card created from nothing at
   * all has no document of its own to borrow.
   */
  documentId: string;
}

// ── Workspace canvas ────────────────────────────────────────────────────────

interface CardBase {
  id: string;
  x: number;
  y: number;
  width: number;
  collapsed: boolean;
  createdAt: string;
  /** Wrapper this card is filed under, or null while it floats free. */
  wrapperId: string | null;
  /**
   * Points in the text this card is connected to. A card may hold several —
   * one note collecting every clause it argues about — and each draws its
   * own line when the card's link is shown. Each records the reference it
   * was filed under.
   */
  connections: CardConnection[];
  /**
   * Where the card lives.
   *   - "margin" — docked in the reader's gutter, level with its passage.
   *     A new comment starts here, next to the text it is about.
   *   - "canvas" — free-floating on the workspace, at (x, y).
   * Dragging a margin card onto the workspace promotes it. Only notes are
   * ever "margin" today; the field sits on the base so the promote/demote
   * plumbing does not have to narrow by kind.
   */
  placement: "margin" | "canvas";
}

export interface ExcerptCard extends CardBase {
  kind: "excerpt";
  text: string;
  color: HighlightColor;
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  /** Anchor for the connector back into the reader; null once the source is gone. */
  highlightId: string | null;
}

/**
 * What a note is about, when it is about something.
 *
 * Two ways to be anchored, because there are two ways a note gets made:
 * commenting on a selection leaves a highlight to hang off, while pinning a
 * loose note to a passage has no highlight and hangs off a point in the
 * paragraph instead. Both resolve to a connector; neither is more real.
 */
export interface CardSource {
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  highlightId: string | null;
  anchor: PassageAnchor | null;
}

/**
 * A short reference the reader writes beside an argument — "ref to 1",
 * "cl. 4.2" — that can carry documents behind it.
 *
 * A link is the reader's own shorthand first and a citation second, which is
 * why the label exists before any attachment does. Both kinds of source hang
 * off it: whole documents by id here, and exact passages as the card
 * connections that carry this link's `id`.
 */
export interface ArgumentLink {
  id: string;
  label: string;
  documentIds: string[];
}

export interface NoteCard extends CardBase {
  kind: "note";
  /** The reader's own name for the note — "Misspelled company name". */
  title: string;
  text: string;
  color: HighlightColor;
  /** Where the note points, or null while it is still a loose thought. */
  source: CardSource | null;
  /**
   * Whole documents cited by this argument, distinct from `connections` —
   * a connection points at one exact passage, this points at "this document,
   * generally". Shown as a plain named list beside the argument's text.
   */
  links: ArgumentLink[];
}

export type WorkspaceCard = ExcerptCard | NoteCard;

/**
 * A titled container on the workspace — "Points to raise with client" — that
 * notes and excerpts file into. Cards inside render stacked under the
 * heading; the wrapper owns their layout, so they keep no free position
 * while they are members.
 */
export interface NoteWrapper {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  collapsed: boolean;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  wrappers: NoteWrapper[];
  cards: WorkspaceCard[];
}

// ── Project ─────────────────────────────────────────────────────────────────

export interface LiquidProject {
  id: string;
  name: string;
  updatedAt: string;
  documents: LiquidDocument[];
  highlights: Highlight[];
  workspaces: Workspace[];
}

// ── Interaction ─────────────────────────────────────────────────────────────

export type PanelId = "search" | null;

/** A live text selection in the reader, before it becomes a highlight. */
export interface ReaderSelection {
  documentId: string;
  pageNumber: number;
  paragraphId: string;
  start: number;
  end: number;
  text: string;
  /** Viewport coords of the selection rect, used to place the floating toolbar. */
  rect: { top: number; left: number; width: number; height: number };
}

export interface SearchHit {
  id: string;
  /** What the hit points at, so clicking can navigate correctly. */
  kind: "paragraph" | "card";
  documentId: string | null;
  documentTitle: string;
  pageNumber: number | null;
  paragraphId: string | null;
  cardId: string | null;
  snippet: string;
  /** Offsets of the match inside `snippet`, for the <mark>. */
  matchStart: number;
  matchEnd: number;
}
