/**
 * The project document model — documents, highlights, workspace cards and
 * the links between them — plus a bounded undo/redo history.
 *
 * This is the reader's working copy of server state, not a source of truth.
 * It starts EMPTY: there is no seed and no mock mode, so nothing is on screen
 * until `hydrateFromServer` fills it from a case the backend actually holds.
 * Not persisted either — `.cursorrules` §3 reserves `persist` for UI prefs,
 * and the server is where work belongs.
 *
 * Mutations go through `commit`, which snapshots the project onto the undo
 * stack first. Callers therefore never have to think about history — the
 * toolbar's undo/redo works for any action added later.
 */

import { create } from "zustand";

import {
  CARD_DEFAULT_WIDTH,
  CARD_SPAWN_ORIGIN,
  CARD_SPAWN_STEP,
  HISTORY_LIMIT,
  WRAPPER_SPAWN_ORIGIN,
} from "../constants";
import type {
  CardConnection,
  DocumentParse,
  ExcerptCard,
  Highlight,
  HighlightColor,
  PassageAnchor,
  LiquidDocument,
  LiquidProject,
  NoteCard,
  ReaderSelection,
  Workspace,
  WorkspaceCard,
} from "../types";
import { createId } from "../utils/id";

// ── Pure helpers ────────────────────────────────────────────────────────────

function mapWorkspace(
  project: LiquidProject,
  workspaceId: string,
  fn: (workspace: Workspace) => Workspace,
): LiquidProject {
  return {
    ...project,
    workspaces: project.workspaces.map((workspace) =>
      workspace.id === workspaceId ? fn(workspace) : workspace,
    ),
  };
}

function mapCards(
  project: LiquidProject,
  workspaceId: string,
  fn: (card: WorkspaceCard) => WorkspaceCard,
): LiquidProject {
  return mapWorkspace(project, workspaceId, (workspace) => ({
    ...workspace,
    cards: workspace.cards.map(fn),
  }));
}

/** Next free slot for a card the user created without dropping it anywhere. */
function nextSpawnPoint(workspace: Workspace | undefined) {
  const index = workspace?.cards.length ?? 0;
  return {
    x: CARD_SPAWN_ORIGIN.x + (index % 6) * CARD_SPAWN_STEP,
    y: CARD_SPAWN_ORIGIN.y + (index % 6) * CARD_SPAWN_STEP,
  };
}

function baseCardFields(workspace: Workspace | undefined, at?: { x: number; y: number }) {
  const spawn = at ?? nextSpawnPoint(workspace);
  return {
    x: spawn.x,
    y: spawn.y,
    width: CARD_DEFAULT_WIDTH,
    collapsed: false,
    createdAt: new Date().toISOString(),
    wrapperId: null,
    connections: [] as CardConnection[],
    placement: "canvas" as const,
  };
}

/** What the store holds before a case is opened, and after one is closed. */
const EMPTY_PROJECT: LiquidProject = {
  id: "",
  name: "",
  updatedAt: "",
  documents: [],
  highlights: [],
  workspaces: [],
};

// ── Store ───────────────────────────────────────────────────────────────────

interface LiquidTextState {
  project: LiquidProject;
  activeDocumentId: string | null;
  /**
   * Every document rendered in the reader, in the order they are shown. The
   * reader concatenates them: all of document one, then all of document two.
   * Never empty while the project has documents.
   */
  selectedDocumentIds: string[];
  activeWorkspaceId: string;
  past: LiquidProject[];
  future: LiquidProject[];

  // Navigation
  /**
   * Point the reader at a document, bringing it on screen if it is not
   * already there. Leaves any other open documents alone — this is what a
   * connector, an outline entry or a defined-term link does.
   */
  setActiveDocument: (documentId: string | null) => void;
  /**
   * Show this document and nothing else. Separate from `setActiveDocument`
   * because clicking a row in the rail means "just this one", while
   * following a link means "take me there" — collapsing the reader's whole
   * selection on a link jump would be a nasty surprise.
   */
  showOnlyDocument: (documentId: string) => void;
  /** Add or remove a document from the reader without disturbing the rest. */
  toggleDocumentSelected: (documentId: string) => void;
  setActiveWorkspace: (workspaceId: string) => void;

  // History
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  resetProject: () => void;
  /**
   * Replace the whole project with what the server sent.
   *
   * Called once when a case opens, and again when a pull brings work the
   * reader does not have. Not a merge — the server is the truth, and the
   * caller only applies a pull when there is nothing local outstanding.
   * History is cleared with it, since undoing across a hydration would step
   * back into another case's state.
   */
  hydrateFromServer: (project: {
    id: string;
    name: string;
    documents: LiquidDocument[];
    highlights: Highlight[];
    workspaces: Workspace[];
  }) => void;
  /**
   * Fill in a document's pages once they have been fetched.
   *
   * Bootstrap carries metadata but not paragraphs — a bundle's text runs to
   * megabytes — so documents arrive empty and are filled as the reader
   * reaches them.
   */
  setDocumentPages: (documentId: string, pages: LiquidDocument["pages"]) => void;
  /**
   * Update a document's extraction state.
   *
   * Set outside the undo history, like page text: the reader did not do it,
   * and undoing back past a parse finishing would be nonsense.
   */
  setDocumentParse: (documentId: string, parse: DocumentParse) => void;
  /**
   * Add the next window of pages to a document already open.
   *
   * Separate from `setDocumentPages`, which replaces: the reader pulls a
   * long PDF down 25 pages at a time, and replacing would throw away
   * everything above the fold each time it reached for more.
   */
  appendDocumentPages: (documentId: string, pages: LiquidDocument["pages"]) => void;
  /**
   * Fold a server delta into what is already here.
   *
   * Distinct from `hydrateFromServer`, and the distinction matters: a pull is
   * everything that changed since a cursor, not a snapshot of the case, so
   * replacing the project with it drops every Point and argument that simply
   * did not change. Merging leaves them alone.
   */
  applyServerDelta: (merged: LiquidProject) => void;

  // Documents
  /**
   * Put a freshly uploaded document on screen at once.
   *
   * Without this the reader waited for the next sync pull to notice it —
   * up to fifteen seconds of an upload that had plainly succeeded showing
   * nothing at all. It arrives selected and active, because someone who has
   * just added a document wants to be looking at it.
   */
  addDocument: (document: LiquidDocument) => void;
  renameDocument: (documentId: string, title: string) => void;
  deleteDocument: (documentId: string) => void;

  // Highlights
  addHighlight: (selection: ReaderSelection, color: HighlightColor) => Highlight | null;
  setHighlightColor: (highlightId: string, color: HighlightColor) => void;
  removeHighlight: (highlightId: string) => void;
  /**
   * Grow or shrink an existing highlight in place, keeping its id — so every
   * card, connector and margin comment anchored to it stays anchored.
   * Re-highlighting instead would orphan all of them.
   */
  reshapeHighlight: (highlightId: string, start: number, end: number, text: string) => void;

  // Cards
  addExcerptFromSelection: (
    selection: ReaderSelection,
    color: HighlightColor,
    at?: { x: number; y: number },
  ) => string | null;
  updateCardTitle: (cardId: string, title: string) => void;
  addNote: (
    text: string,
    at?: { x: number; y: number },
    source?: NoteCard["source"],
    placement?: WorkspaceCard["placement"],
  ) => string;
  /** Comment made from a selection: docks in the reader's gutter, not the canvas. */
  addMarginNote: (text: string, source: NonNullable<NoteCard["source"]>) => string;

  // Wrappers — titled containers notes and excerpts file into.
  addWrapper: (title: string, at?: { x: number; y: number }) => string;
  renameWrapper: (wrapperId: string, title: string) => void;
  moveWrapper: (wrapperId: string, x: number, y: number) => void;
  toggleWrapperCollapsed: (wrapperId: string) => void;
  /**
   * Move a Point to a new position in the numbered strip.
   *
   * `to` is the index it should end up at, and everything between slides to
   * make room — dropping the ninth Point on the first leaves it numbered 1
   * and the old 1 numbered 2, not swapped to the far end.
   *
   * Order is not stored on the Point; it *is* the position in this array, and
   * the sync diff sends the index. So reordering here is the whole change,
   * and the server hears about it like any other edit.
   */
  reorderWrapper: (wrapperId: string, to: number) => void;
  /** Deleting a wrapper takes its cards with it. */
  deleteWrapper: (wrapperId: string) => void;
  /** File a card under a wrapper, or set null to float it free again. */
  assignCardToWrapper: (cardId: string, wrapperId: string | null) => void;
  /** New empty note born inside a wrapper, ready to type into. */
  addNoteInWrapper: (wrapperId: string) => string;
  /** Cite a whole document from this argument — not one passage, the document itself. */
  /** New empty reference on an argument, ready to be labelled. */
  addCardLink: (cardId: string) => string;
  updateCardLinkLabel: (cardId: string, linkId: string, label: string) => void;
  /**
   * Remove a reference, and the passages filed under it.
   *
   * A passage is attached to a reference, not to the argument as a whole, so
   * a reference that goes takes its connections with it. Left behind they
   * pointed at a reference that no longer existed: no notch to open them
   * from, no line the reader could see or cut, and a row the server was never
   * told to tombstone.
   */
  removeCardLink: (cardId: string, linkId: string) => void;
  attachDocumentToLink: (cardId: string, linkId: string, documentId: string) => void;
  detachDocumentFromLink: (cardId: string, linkId: string, documentId: string) => void;

  /** Margin → canvas: the card gets a position and starts floating. */
  promoteCardToCanvas: (cardId: string, x: number, y: number) => void;
  /** Pin a loose note to a point in the text, so it grows a thread. */
  attachCardToPassage: (cardId: string, documentId: string, anchor: PassageAnchor) => void;
  /**
   * Point one of the card's references at a passage — or the card itself,
   * when `linkId` is null. A reference holds one passage: pointing it
   * somewhere new moves it rather than collecting both.
   */
  addCardConnection: (
    cardId: string,
    anchor: PassageAnchor & { documentId: string },
    linkId?: string | null,
  ) => void;
  /** Remove a single drawn connection, by its position in the list. */
  removeCardConnection: (cardId: string, index: number) => void;
  /** Cut a note loose again; the note and its text survive, the thread goes. */
  detachCard: (cardId: string) => void;
  moveCard: (cardId: string, x: number, y: number) => void;
  resizeCard: (cardId: string, width: number) => void;
  updateCardText: (cardId: string, text: string) => void;
  setCardColor: (cardId: string, color: HighlightColor) => void;
  toggleCardCollapsed: (cardId: string) => void;
  duplicateCard: (cardId: string) => void;
  deleteCard: (cardId: string) => void;
}

export const useLiquidTextStore = create<LiquidTextState>((set, get) => {
  /** Apply a pure project transform and push the previous state onto `past`. */
  function commit(mutate: (project: LiquidProject) => LiquidProject) {
    set((state) => {
      const next = mutate(state.project);
      if (next === state.project) return state;
      return {
        project: { ...next, updatedAt: new Date().toISOString() },
        past: [...state.past, state.project].slice(-HISTORY_LIMIT),
        future: [],
      };
    });
  }

  function activeWorkspace(): Workspace | undefined {
    const { project, activeWorkspaceId } = get();
    return project.workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  }

  return {
    project: EMPTY_PROJECT,
    activeDocumentId: null,
    selectedDocumentIds: [],
    activeWorkspaceId: "ws-root",
    past: [],
    future: [],

    setActiveDocument: (documentId) =>
      set((state) => {
        if (documentId === null) return { activeDocumentId: null };
        // Navigating to a document that is not on screen brings it on screen.
        // Anything else would leave the reader pointed at a document they
        // cannot see — which is what a connector or a term link would do.
        return {
          activeDocumentId: documentId,
          selectedDocumentIds: state.selectedDocumentIds.includes(documentId)
            ? state.selectedDocumentIds
            : [documentId],
        };
      }),

    showOnlyDocument: (documentId) =>
      set({ activeDocumentId: documentId, selectedDocumentIds: [documentId] }),

    toggleDocumentSelected: (documentId) =>
      set((state) => {
        const selected = state.selectedDocumentIds.includes(documentId);
        // Deselecting the last document would leave the reader with nothing
        // to render, so the final one is sticky.
        if (selected && state.selectedDocumentIds.length === 1) return state;

        const next = selected
          ? state.selectedDocumentIds.filter((id) => id !== documentId)
          : // Keep project order, so the reader's scroll order matches the rail.
            state.project.documents
              .map((document) => document.id)
              .filter((id) => state.selectedDocumentIds.includes(id) || id === documentId);

        return {
          selectedDocumentIds: next,
          activeDocumentId:
            state.activeDocumentId && next.includes(state.activeDocumentId)
              ? state.activeDocumentId
              : (next[0] ?? null),
        };
      }),
    setActiveWorkspace: (workspaceId) => set({ activeWorkspaceId: workspaceId }),

    undo: () =>
      set((state) => {
        const previous = state.past[state.past.length - 1];
        if (!previous) return state;
        return {
          project: previous,
          past: state.past.slice(0, -1),
          future: [state.project, ...state.future].slice(0, HISTORY_LIMIT),
        };
      }),

    redo: () =>
      set((state) => {
        const [next, ...rest] = state.future;
        if (!next) return state;
        return {
          project: next,
          past: [...state.past, state.project].slice(-HISTORY_LIMIT),
          future: rest,
        };
      }),

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    resetProject: () =>
      set({
        project: EMPTY_PROJECT,
        activeDocumentId: null,
        selectedDocumentIds: [],
        activeWorkspaceId: "ws-root",
        past: [],
        future: [],
      }),

    // ── Documents ───────────────────────────────────────────────────────────

    hydrateFromServer: (project) =>
      set({
        project: { ...project, updatedAt: new Date().toISOString() },
        activeDocumentId: project.documents[0]?.id ?? null,
        // The reader opened a bundle: everything in it is on screen to begin
        // with, and the rail's ticks are for narrowing that down.
        selectedDocumentIds: project.documents.map((document) => document.id),
        activeWorkspaceId: project.workspaces[0]?.id ?? "ws-root",
        // Cleared with the hydration: undoing across it would step back into
        // a different case's state.
        past: [],
        future: [],
      }),

    applyServerDelta: (merged) =>
      set((state) => ({
        project: merged,
        // Whatever the reader was looking at, they still are. A colleague's
        // edit arriving should not move the document out from under them.
        selectedDocumentIds: state.selectedDocumentIds.filter((id) =>
          merged.documents.some((document) => document.id === id),
        ),
      })),

    appendDocumentPages: (documentId, pages) =>
      set((state) => ({
        project: {
          ...state.project,
          documents: state.project.documents.map((document) => {
            if (document.id !== documentId) return document;
            // Merged by page number rather than concatenated: two windows can
            // overlap if a fetch is retried, and a page rendered twice is
            // worse than one fetched twice.
            const byNumber = new Map(document.pages.map((page) => [page.number, page]));
            for (const page of pages) byNumber.set(page.number, page);
            return {
              ...document,
              pages: [...byNumber.values()].sort((a, b) => a.number - b.number),
            };
          }),
        },
      })),

    setDocumentParse: (documentId, parse) =>
      set((state) => ({
        project: {
          ...state.project,
          documents: state.project.documents.map((document) =>
            document.id === documentId ? { ...document, parse } : document,
          ),
        },
      })),

    setDocumentPages: (documentId, pages) =>
      set((state) => ({
        project: {
          ...state.project,
          documents: state.project.documents.map((document) =>
            document.id === documentId ? { ...document, pages } : document,
          ),
        },
      })),

    addDocument: (document) => {
      commit((project) =>
        project.documents.some((entry) => entry.id === document.id)
          ? project
          : { ...project, documents: [...project.documents, document] },
      );
      set((state) => ({
        activeDocumentId: document.id,
        selectedDocumentIds: state.selectedDocumentIds.includes(document.id)
          ? state.selectedDocumentIds
          : [...state.selectedDocumentIds, document.id],
      }));
    },

    renameDocument: (documentId, title) =>
      commit((project) => ({
        ...project,
        documents: project.documents.map((document) =>
          document.id === documentId ? { ...document, title } : document,
        ),
      })),

    deleteDocument: (documentId) => {
      commit((project) => ({
        ...project,
        documents: project.documents.filter((document) => document.id !== documentId),
        highlights: project.highlights.filter((highlight) => highlight.documentId !== documentId),
        // The same cascade the server runs, so the canvas matches what the
        // next pull will say rather than correcting itself a moment later.
        //
        // An excerpt is a quotation of the document — it exists because the
        // document did, so it goes with it. A note is the reader's own
        // writing and stays; it only loses the passages that no longer
        // resolve, and its references keep their labels.
        workspaces: project.workspaces.map((workspace) => ({
          ...workspace,
          cards: workspace.cards
            .filter((card) => !(card.kind === "excerpt" && card.documentId === documentId))
            .map((card) => ({
              ...card,
              connections: card.connections.filter(
                (connection) => connection.documentId !== documentId,
              ),
            })),
        })),
      }));
      set((state) => {
        const remaining = state.selectedDocumentIds.filter((id) => id !== documentId);
        const fallback = remaining.length > 0 ? remaining : [state.project.documents[0]?.id];
        const next = fallback.filter((id): id is string => Boolean(id));
        return {
          selectedDocumentIds: next,
          activeDocumentId:
            state.activeDocumentId === documentId ? (next[0] ?? null) : state.activeDocumentId,
        };
      });
    },

    // ── Highlights ──────────────────────────────────────────────────────────

    addHighlight: (selection, color) => {
      if (color === "clear") return null;

      // Re-highlighting the same run — picking a second colour, or adding a
      // second colour on a passage that is already marked — recolours the existing
      // highlight instead of stacking a duplicate underneath it. Duplicates
      // would look identical but double every connector and search hit.
      const existing = get().project.highlights.find(
        (entry) =>
          entry.paragraphId === selection.paragraphId &&
          entry.start === selection.start &&
          entry.end === selection.end,
      );
      if (existing) {
        if (existing.color !== color) {
          commit((project) => ({
            ...project,
            highlights: project.highlights.map((entry) =>
              entry.id === existing.id ? { ...entry, color } : entry,
            ),
          }));
        }
        return { ...existing, color };
      }

      const highlight: Highlight = {
        id: createId(),
        documentId: selection.documentId,
        pageNumber: selection.pageNumber,
        paragraphId: selection.paragraphId,
        start: selection.start,
        end: selection.end,
        color,
        text: selection.text,
        createdAt: new Date().toISOString(),
      };
      commit((project) => ({ ...project, highlights: [...project.highlights, highlight] }));
      return highlight;
    },

    setHighlightColor: (highlightId, color) =>
      commit((project) =>
        color === "clear"
          ? {
              ...project,
              highlights: project.highlights.filter((highlight) => highlight.id !== highlightId),
            }
          : {
              ...project,
              highlights: project.highlights.map((highlight) =>
                highlight.id === highlightId ? { ...highlight, color } : highlight,
              ),
            },
      ),

    removeHighlight: (highlightId) =>
      commit((project) => ({
        ...project,
        highlights: project.highlights.filter((highlight) => highlight.id !== highlightId),
      })),

    reshapeHighlight: (highlightId, start, end, text) =>
      commit((project) => ({
        ...project,
        highlights: project.highlights.map((highlight) =>
          highlight.id === highlightId
            ? { ...highlight, start: Math.min(start, end), end: Math.max(start, end), text }
            : highlight,
        ),
      })),

    addExcerptFromSelection: (selection, color, at) => {
      const { project, activeWorkspaceId } = get();
      const document = project.documents.find((doc) => doc.id === selection.documentId);
      if (!document) return null;

      // An excerpt always leaves a highlight behind — that is the anchor the
      // connector draws to, and how the card survives a scroll away.
      const effectiveColor: HighlightColor = color === "clear" ? "yellow" : color;
      const highlight: Highlight = {
        id: createId(),
        documentId: selection.documentId,
        pageNumber: selection.pageNumber,
        paragraphId: selection.paragraphId,
        start: selection.start,
        end: selection.end,
        color: effectiveColor,
        text: selection.text,
        createdAt: new Date().toISOString(),
      };

      const card: ExcerptCard = {
        id: createId(),
        kind: "excerpt",
        text: selection.text,
        color: effectiveColor,
        documentId: document.id,
        documentTitle: document.title,
        pageNumber: selection.pageNumber,
        highlightId: highlight.id,
        ...baseCardFields(
          project.workspaces.find((workspace) => workspace.id === activeWorkspaceId),
          at,
        ),
      };

      commit((current) =>
        mapWorkspace(
          { ...current, highlights: [...current.highlights, highlight] },
          activeWorkspaceId,
          (workspace) => ({ ...workspace, cards: [...workspace.cards, card] }),
        ),
      );
      return card.id;
    },

    addNote: (text, at, source = null, placement = "canvas") => {
      const workspaceId = get().activeWorkspaceId;
      const card: NoteCard = {
        id: createId(),
        kind: "note",
        title: "",
        text,
        color: "clear",
        source,
        links: [],
        ...baseCardFields(activeWorkspace(), at),
        placement,
      };
      commit((project) =>
        mapWorkspace(project, workspaceId, (workspace) => ({
          ...workspace,
          cards: [...workspace.cards, card],
        })),
      );
      return card.id;
    },

    addMarginNote: (text, source) => get().addNote(text, { x: 0, y: 0 }, source, "margin"),

    addWrapper: (title, at) => {
      const workspaceId = get().activeWorkspaceId;
      /**
       * A new Point starts at the top of the canvas, not below the ones
       * before it. The workspace shows one Point at a time, so stepping each
       * new one further down only bought a scroll back up before it could be
       * used — and the ones underneath were never on screen together anyway.
       */
      const spawn = at ?? WRAPPER_SPAWN_ORIGIN;
      const wrapper = {
        id: createId(),
        title,
        x: spawn.x,
        y: spawn.y,
        // Wide enough to hold a full-size argument card, plus the gutter the
        // notch lives in beside its references.
        width: 560,
        collapsed: false,
        createdAt: new Date().toISOString(),
      };
      commit((project) =>
        mapWorkspace(project, workspaceId, (current) => ({
          ...current,
          wrappers: [...current.wrappers, wrapper],
        })),
      );
      return wrapper.id;
    },

    renameWrapper: (wrapperId, title) => {
      const workspaceId = get().activeWorkspaceId;
      commit((project) =>
        mapWorkspace(project, workspaceId, (workspace) => ({
          ...workspace,
          wrappers: workspace.wrappers.map((wrapper) =>
            wrapper.id === wrapperId ? { ...wrapper, title } : wrapper,
          ),
        })),
      );
    },

    moveWrapper: (wrapperId, x, y) => {
      const workspaceId = get().activeWorkspaceId;
      commit((project) =>
        mapWorkspace(project, workspaceId, (workspace) => ({
          ...workspace,
          wrappers: workspace.wrappers.map((wrapper) =>
            wrapper.id === wrapperId
              ? { ...wrapper, x: Math.max(0, x), y: Math.max(0, y) }
              : wrapper,
          ),
        })),
      );
    },

    toggleWrapperCollapsed: (wrapperId) => {
      const workspaceId = get().activeWorkspaceId;
      commit((project) =>
        mapWorkspace(project, workspaceId, (workspace) => ({
          ...workspace,
          wrappers: workspace.wrappers.map((wrapper) =>
            wrapper.id === wrapperId ? { ...wrapper, collapsed: !wrapper.collapsed } : wrapper,
          ),
        })),
      );
    },

    reorderWrapper: (wrapperId, to) => {
      const workspaceId = get().activeWorkspaceId;
      commit((project) =>
        mapWorkspace(project, workspaceId, (workspace) => {
          const from = workspace.wrappers.findIndex((wrapper) => wrapper.id === wrapperId);
          if (from < 0) return workspace;

          // Clamped rather than trusted: a drop past the end of the strip is a
          // drop on the last position, not an index off the end of the array.
          const target = Math.max(0, Math.min(workspace.wrappers.length - 1, to));
          if (target === from) return workspace;

          const wrappers = [...workspace.wrappers];
          const [moved] = wrappers.splice(from, 1);
          if (!moved) return workspace;
          wrappers.splice(target, 0, moved);

          return { ...workspace, wrappers };
        }),
      );
    },

    deleteWrapper: (wrapperId) => {
      const workspaceId = get().activeWorkspaceId;
      /**
       * A Point takes its arguments with it.
       *
       * They used to step out onto the canvas, which kept the reader's work
       * but left it in a pile with nothing to say where it came from. Deleting
       * a Point is deleting the thinking under it, so the whole subtree goes:
       * the heading, its arguments, and — because the diff no longer finds
       * them in the project — their references and passages as well.
       *
       * Nothing is destroyed. Every row lands in the database with
       * `isDeleted` set, which is how a device that was offline learns they
       * are gone rather than finding a silent gap.
       */
      commit((project) =>
        mapWorkspace(project, workspaceId, (workspace) => ({
          ...workspace,
          wrappers: workspace.wrappers.filter((wrapper) => wrapper.id !== wrapperId),
          cards: workspace.cards.filter((card) => card.wrapperId !== wrapperId),
        })),
      );
    },

    assignCardToWrapper: (cardId, wrapperId) => {
      const workspaceId = get().activeWorkspaceId;
      commit((project) =>
        mapCards(project, workspaceId, (card) =>
          card.id === cardId
            ? // Filing a card also brings it out of the margin — a wrapper
              // member lives on the canvas by definition.
              { ...card, wrapperId, placement: "canvas" as const }
            : card,
        ),
      );
    },

    addNoteInWrapper: (wrapperId) => {
      const noteId = get().addNote("");
      get().assignCardToWrapper(noteId, wrapperId);
      return noteId;
    },

    addCardLink: (cardId) => {
      const workspaceId = get().activeWorkspaceId;
      const linkId = createId();
      commit((project) =>
        mapCards(project, workspaceId, (card) =>
          card.id === cardId && card.kind === "note"
            ? { ...card, links: [...card.links, { id: linkId, label: "", documentIds: [] }] }
            : card,
        ),
      );
      return linkId;
    },

    updateCardLinkLabel: (cardId, linkId, label) => {
      const workspaceId = get().activeWorkspaceId;
      commit((project) =>
        mapCards(project, workspaceId, (card) =>
          card.id === cardId && card.kind === "note"
            ? {
                ...card,
                links: card.links.map((link) => (link.id === linkId ? { ...link, label } : link)),
              }
            : card,
        ),
      );
    },

    removeCardLink: (cardId, linkId) => {
      const workspaceId = get().activeWorkspaceId;
      commit((project) =>
        mapCards(project, workspaceId, (card) =>
          card.id === cardId && card.kind === "note"
            ? {
                ...card,
                links: card.links.filter((link) => link.id !== linkId),
                // The passages go with it. Once they leave the project the
                // diff stops finding them and sends tombstones, exactly as it
                // does for a line the reader cuts by hand.
                connections: card.connections.filter((connection) => connection.linkId !== linkId),
              }
            : card,
        ),
      );
    },

    attachDocumentToLink: (cardId, linkId, documentId) => {
      const workspaceId = get().activeWorkspaceId;
      commit((project) =>
        mapCards(project, workspaceId, (card) =>
          card.id === cardId && card.kind === "note"
            ? {
                ...card,
                links: card.links.map((link) =>
                  link.id === linkId && !link.documentIds.includes(documentId)
                    ? { ...link, documentIds: [...link.documentIds, documentId] }
                    : link,
                ),
              }
            : card,
        ),
      );
    },

    detachDocumentFromLink: (cardId, linkId, documentId) => {
      const workspaceId = get().activeWorkspaceId;
      commit((project) =>
        mapCards(project, workspaceId, (card) =>
          card.id === cardId && card.kind === "note"
            ? {
                ...card,
                links: card.links.map((link) =>
                  link.id === linkId
                    ? {
                        ...link,
                        documentIds: link.documentIds.filter((id) => id !== documentId),
                      }
                    : link,
                ),
              }
            : card,
        ),
      );
    },

    promoteCardToCanvas: (cardId, x, y) => {
      const workspaceId = get().activeWorkspaceId;
      commit((project) =>
        mapCards(project, workspaceId, (card) =>
          card.id === cardId
            ? { ...card, placement: "canvas", x: Math.max(0, x), y: Math.max(0, y) }
            : card,
        ),
      );
    },

    attachCardToPassage: (cardId, documentId, anchor) => {
      const workspaceId = get().activeWorkspaceId;
      const document = get().project.documents.find((entry) => entry.id === documentId);
      // A pin into a document the project does not have would leave a source
      // nothing can resolve — no title, no page to jump to. Ignore it.
      if (!document) return;
      commit((project) =>
        mapCards(project, workspaceId, (card) =>
          card.id === cardId && card.kind === "note"
            ? {
                ...card,
                source: {
                  documentId: document.id,
                  documentTitle: document.title,
                  pageNumber: anchor.pageNumber,
                  // Pinned to a bare point: there is no highlight behind it.
                  highlightId: null,
                  anchor,
                },
              }
            : card,
        ),
      );
    },

    addCardConnection: (cardId, anchor, linkId = null) => {
      const workspaceId = get().activeWorkspaceId;
      commit((project) =>
        mapCards(project, workspaceId, (card) =>
          card.id === cardId
            ? {
                ...card,
                connections: [
                  // One passage per reference: the previous one steps aside.
                  ...card.connections.filter(
                    (connection) => linkId === null || connection.linkId !== linkId,
                  ),
                  { ...anchor, linkId },
                ],
              }
            : card,
        ),
      );
    },

    removeCardConnection: (cardId, index) => {
      const workspaceId = get().activeWorkspaceId;
      commit((project) =>
        mapCards(project, workspaceId, (card) =>
          card.id === cardId
            ? { ...card, connections: card.connections.filter((_, at) => at !== index) }
            : card,
        ),
      );
    },

    detachCard: (cardId) => {
      const workspaceId = get().activeWorkspaceId;
      commit((project) =>
        mapCards(project, workspaceId, (card) =>
          card.id === cardId && card.kind === "note"
            ? // Losing the passage also brings the card in off the seam —
              // a margin comment with nothing to sit beside has no home there.
              { ...card, source: null, placement: "canvas" as const }
            : card,
        ),
      );
    },

    moveCard: (cardId, x, y) => {
      const workspaceId = get().activeWorkspaceId;
      commit((project) =>
        mapCards(project, workspaceId, (card) => (card.id === cardId ? { ...card, x, y } : card)),
      );
    },

    resizeCard: (cardId, width) => {
      const workspaceId = get().activeWorkspaceId;
      commit((project) =>
        mapCards(project, workspaceId, (card) => (card.id === cardId ? { ...card, width } : card)),
      );
    },

    updateCardTitle: (cardId, title) => {
      const workspaceId = get().activeWorkspaceId;
      commit((project) =>
        mapCards(project, workspaceId, (card) =>
          card.id === cardId && card.kind === "note" ? { ...card, title } : card,
        ),
      );
    },

    updateCardText: (cardId, text) => {
      const workspaceId = get().activeWorkspaceId;
      commit((project) =>
        mapCards(project, workspaceId, (card) => (card.id === cardId ? { ...card, text } : card)),
      );
    },

    setCardColor: (cardId, color) => {
      const workspaceId = get().activeWorkspaceId;
      commit((project) =>
        mapCards(project, workspaceId, (card) => (card.id === cardId ? { ...card, color } : card)),
      );
    },

    toggleCardCollapsed: (cardId) => {
      const workspaceId = get().activeWorkspaceId;
      commit((project) =>
        mapCards(project, workspaceId, (card) =>
          card.id === cardId ? { ...card, collapsed: !card.collapsed } : card,
        ),
      );
    },

    duplicateCard: (cardId) => {
      const workspaceId = get().activeWorkspaceId;
      commit((project) =>
        mapWorkspace(project, workspaceId, (workspace) => {
          const source = workspace.cards.find((card) => card.id === cardId);
          if (!source) return workspace;
          const copy: WorkspaceCard = {
            ...source,
            id: createId(),
            x: source.x + 24,
            y: source.y + 24,
            createdAt: new Date().toISOString(),
          };
          return { ...workspace, cards: [...workspace.cards, copy] };
        }),
      );
    },

    deleteCard: (cardId) => {
      const workspaceId = get().activeWorkspaceId;
      commit((project) =>
        mapWorkspace(project, workspaceId, (workspace) => ({
          ...workspace,
          cards: workspace.cards.filter((card) => card.id !== cardId),
        })),
      );
    },
  };
});
