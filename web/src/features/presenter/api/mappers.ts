/**
 * Wire → UI mapping.
 *
 * The server and the reader disagree about two things on purpose, and this is
 * where that is reconciled:
 *
 *   - **Layout.** Canvas coordinates are not server state — a desktop `x`/`y`
 *     means nothing on a phone — so the server stores an `order` and the
 *     reader lays cards out from it. Hydration synthesises positions; nothing
 *     sends them back.
 *   - **Page text.** Bootstrap carries document metadata but not paragraphs,
 *     because a bundle's text runs to megabytes. Documents arrive with empty
 *     pages and are filled in as the reader reaches them.
 */

import { CARD_DEFAULT_WIDTH, CARD_SPAWN_ORIGIN, CARD_SPAWN_STEP } from "../constants";
import type {
  ArgumentLink,
  CardConnection,
  Highlight,
  HighlightColor,
  LiquidDocument,
  NoteWrapper,
  Workspace,
  WorkspaceCard,
} from "../types";
import type { WireBootstrap, WireDocument, WireParagraphSchema } from "../schemas/presenter.schema";
import type { z } from "zod";

type WireParagraph = z.infer<typeof WireParagraphSchema>;

const color = (value: string): HighlightColor =>
  (["red", "green", "blue", "yellow", "magenta", "cyan", "clear"] as const).includes(
    value as HighlightColor,
  )
    ? (value as HighlightColor)
    : "clear";

/** Where a card sits, derived from its order rather than stored. */
export const positionFor = (index: number) => ({
  x: CARD_SPAWN_ORIGIN.x + (index % 6) * CARD_SPAWN_STEP,
  y: CARD_SPAWN_ORIGIN.y + (index % 6) * CARD_SPAWN_STEP,
});

export const mapDocument = (wire: WireDocument): LiquidDocument => ({
  id: wire._id,
  title: wire.title,
  kind: wire.kind,
  folderId: wire.folderId,
  ocrComplete: wire.ocrComplete,
  visibleToCollaborators: true,
  parse: {
    status: wire.parse.status,
    pageCount: wire.parse.pageCount,
    pagesDone: wire.parse.pagesDone,
    canRetry: wire.parse.canRetry,
    error: wire.parse.error,
  },
  // Filled in by `setDocumentPages` once the reader reaches them.
  pages: [],
});

export const mapPages = (
  pages: { pageNumber: number; paragraphs: WireParagraph[] }[],
): LiquidDocument["pages"] =>
  pages.map((page) => ({
    number: page.pageNumber,
    paragraphs: page.paragraphs.map((paragraph) => ({
      id: paragraph.id,
      text: paragraph.text,
      // Carried through so the text can be laid over the rendered page. Only
      // well-formed boxes survive: a partial one would place a line wrongly,
      // which is worse than typesetting it.
      ...(paragraph.runs?.length
        ? {
            runs: paragraph.runs
              .filter((run) => run.bbox?.length === 4)
              .map((run) => ({
                start: run.start,
                end: run.end,
                bbox: run.bbox as [number, number, number, number],
              })),
          }
        : {}),
      ...(paragraph.label ? { label: paragraph.label } : {}),
      ...(paragraph.heading ? { heading: true } : {}),
      ...(paragraph.indent === 1 || paragraph.indent === 2 ? { indent: paragraph.indent } : {}),
    })),
  }));

export const mapHighlight = (wire: WireBootstrap["highlights"][number]): Highlight => ({
  id: wire._id,
  documentId: wire.documentId,
  pageNumber: wire.pageNumber,
  paragraphId: wire.paragraphId,
  start: wire.start,
  end: wire.end,
  color: color(wire.color),
  text: wire.text,
  createdAt: wire.lastModifiedAt,
});

export const mapWrapper = (
  wire: WireBootstrap["wrappers"][number],
  index: number,
): NoteWrapper => ({
  id: wire._id,
  title: wire.title,
  ...positionFor(index),
  width: 560,
  collapsed: false,
  createdAt: wire.lastModifiedAt,
});

export const mapCard = (
  wire: WireBootstrap["cards"][number],
  index: number,
  links: ArgumentLink[],
  connections: CardConnection[],
): WorkspaceCard => {
  const base = {
    id: wire._id,
    ...positionFor(index),
    width: CARD_DEFAULT_WIDTH,
    collapsed: false,
    createdAt: wire.lastModifiedAt,
    wrapperId: wire.wrapperId,
    connections,
    placement: wire.placement,
  };

  if (wire.kind === "excerpt") {
    return {
      ...base,
      kind: "excerpt",
      text: wire.text,
      color: color(wire.color),
      documentId: wire.documentId ?? "",
      documentTitle: "",
      pageNumber: wire.pageNumber ?? 1,
      highlightId: wire.highlightId,
    };
  }

  return {
    ...base,
    kind: "note",
    title: wire.title,
    text: wire.text,
    color: color(wire.color),
    // A note's source is derived from its own highlight, if it has one; the
    // server keeps the anchor on the connection rather than duplicating it.
    source: wire.documentId
      ? {
          documentId: wire.documentId,
          documentTitle: "",
          pageNumber: wire.pageNumber ?? 1,
          highlightId: wire.highlightId,
          anchor: null,
        }
      : null,
    links,
  };
};

/**
 * The canvas, assembled from the flat node sets bootstrap returns.
 *
 * There is no workspace collection: Points and arguments scope to the case
 * directly. The reader's model still wants one container to hang them off, so
 * a single canvas is derived here rather than stored anywhere.
 */
export const mapWorkspace = (wire: WireBootstrap, presenterId: string): Workspace => {
  const linksByCard = new Map<string, ArgumentLink[]>();
  for (const link of [...wire.links].sort((a, b) => a.order - b.order)) {
    const list = linksByCard.get(link.cardId) ?? [];
    list.push({ id: link._id, label: link.label, documentIds: link.documentIds });
    linksByCard.set(link.cardId, list);
  }

  const connectionsByCard = new Map<string, CardConnection[]>();
  for (const connection of wire.connections) {
    const list = connectionsByCard.get(connection.cardId) ?? [];
    list.push({
      // The server's id, kept rather than discarded — see `CardConnection.id`.
      id: connection._id,
      linkId: connection.linkId,
      documentId: connection.documentId,
      paragraphId: connection.paragraphId,
      pageNumber: connection.pageNumber,
      ratioX: connection.ratioX,
      ratioY: connection.ratioY,
    });
    connectionsByCard.set(connection.cardId, list);
  }

  return {
    // A local grouping id, never sent: Points and arguments belong to the
    // case on the server, and the canvas only needs something to hold them.
    id: presenterId,
    name: "",
    wrappers: [...wire.wrappers]
      .sort((a, b) => a.order - b.order)
      .map((wrapper, index) => mapWrapper(wrapper, index)),
    cards: [...wire.cards]
      .sort((a, b) => a.order - b.order)
      .map((card, index) =>
        mapCard(
          card,
          index,
          linksByCard.get(card._id) ?? [],
          connectionsByCard.get(card._id) ?? [],
        ),
      ),
  };
};
