/**
 * Folding a pull into the project the reader already has.
 *
 * A pull is a **delta** — everything that changed since the caller's cursor,
 * tombstones included — and not a snapshot of the case. Treating it as one
 * rebuilds the workspace from whatever happened to change in the last few
 * seconds and quietly drops the rest, which looks exactly like work
 * disappearing from the canvas while the database still holds it.
 *
 * So every collection is merged by id: present-and-alive upserts, present-and-
 * tombstoned removes, absent is left alone.
 *
 * `skipIds` holds the nodes the reader has edited but not yet pushed. Those are
 * left exactly as they are: the push that is about to carry them is what
 * resolves them, on the server, by last-write-wins. Everything else in the
 * delta is taken — which is the whole point, because the alternative that used
 * to be in place was dropping the entire pull whenever anything local was
 * outstanding, and never offering those rows again.
 */

import type {
  ArgumentLink,
  CardConnection,
  Highlight,
  LiquidDocument,
  LiquidProject,
  NoteCard,
  WorkspaceCard,
} from "../types";
import type { WireBootstrap, WireDocument } from "../schemas/presenter.schema";
import { mapCard, mapDocument, mapHighlight, mapWrapper } from "./mappers";

type Pull = Partial<{
  wrappers: WireBootstrap["wrappers"];
  cards: WireBootstrap["cards"];
  links: WireBootstrap["links"];
  connections: WireBootstrap["connections"];
  highlights: WireBootstrap["highlights"];
}>;

/** Upsert-or-remove a keyed list, leaving anything the delta omits untouched. */
function merge<TExisting extends { id: string }, TWire extends { _id: string; isDeleted: boolean }>(
  existing: readonly TExisting[],
  incoming: readonly TWire[] | undefined,
  build: (wire: TWire, index: number) => TExisting,
): TExisting[] {
  if (!incoming || incoming.length === 0) return [...existing];

  const next = [...existing];
  for (const wire of incoming) {
    const at = next.findIndex((entry) => entry.id === wire._id);
    if (wire.isDeleted) {
      if (at >= 0) next.splice(at, 1);
      continue;
    }
    const built = build(wire, at >= 0 ? at : next.length);
    if (at >= 0) next[at] = built;
    else next.push(built);
  }
  return next;
}

export function mergeDelta(
  project: LiquidProject,
  pull: Pull,
  documents: readonly WireDocument[],
  skipIds: ReadonlySet<string> = new Set(),
): LiquidProject {
  const workspace = project.workspaces[0];

  /*
   * Drop the reader's own outstanding nodes out of the delta before anything
   * else looks at it. Done once, here, rather than threaded through each
   * collection's merge: every one of them keys on `_id`, so one filter covers
   * all of them and there is no collection left to forget.
   */
  if (skipIds.size > 0) {
    pull = {
      wrappers: pull.wrappers?.filter((row) => !skipIds.has(row._id)),
      cards: pull.cards?.filter((row) => !skipIds.has(row._id)),
      links: pull.links?.filter((row) => !skipIds.has(row._id)),
      connections: pull.connections?.filter((row) => !skipIds.has(row._id)),
      highlights: pull.highlights?.filter((row) => !skipIds.has(row._id)),
    };
  }

  // ── documents: metadata moves, page text stays ───────────────────────────
  // The pull carries parse status and titles, never paragraphs, so a document
  // already read keeps the text it has rather than blanking.
  const nextDocuments: LiquidDocument[] = [...project.documents];
  for (const wire of documents) {
    const at = nextDocuments.findIndex((entry) => entry.id === wire._id);
    if (wire.isDeleted) {
      // A document somebody else removed. Without this the pull would upsert
      // the tombstone back into the rail as a live document.
      if (at >= 0) nextDocuments.splice(at, 1);
      continue;
    }
    const mapped = mapDocument(wire);
    if (at >= 0) nextDocuments[at] = { ...mapped, pages: nextDocuments[at]!.pages };
    else nextDocuments.push(mapped);
  }

  const highlights = merge<Highlight, WireBootstrap["highlights"][number]>(
    project.highlights,
    pull.highlights,
    mapHighlight,
  );

  if (!workspace) {
    return { ...project, documents: nextDocuments, highlights };
  }

  const wrappers = merge(workspace.wrappers, pull.wrappers, mapWrapper);

  /**
   * Cards keep their references and passages across a merge.
   *
   * A card in the delta arrives without them — links and connections are their
   * own collections and travel separately — so rebuilding a card from the wire
   * alone would strip every reference off it until the next full load.
   */
  let cards: WorkspaceCard[] = [...workspace.cards];
  if (pull.cards?.length) {
    for (const wire of pull.cards) {
      const at = cards.findIndex((entry) => entry.id === wire._id);
      if (wire.isDeleted) {
        if (at >= 0) cards.splice(at, 1);
        continue;
      }
      const existing = at >= 0 ? cards[at] : undefined;
      const built = mapCard(
        wire,
        at >= 0 ? at : cards.length,
        existing?.kind === "note" ? existing.links : [],
        existing?.connections ?? [],
      );
      if (at >= 0) cards[at] = built;
      else cards.push(built);
    }
  }

  // ── references, filed back onto their card ───────────────────────────────
  if (pull.links?.length) {
    cards = cards.map((card) => {
      if (card.kind !== "note") return card;
      const mine = pull.links!.filter((link) => link.cardId === card.id);
      if (mine.length === 0) return card;

      const links: ArgumentLink[] = [...card.links];
      for (const wire of mine) {
        const at = links.findIndex((link) => link.id === wire._id);
        if (wire.isDeleted) {
          if (at >= 0) links.splice(at, 1);
          continue;
        }
        const built = { id: wire._id, label: wire.label, documentIds: wire.documentIds };
        if (at >= 0) links[at] = built;
        else links.push(built);
      }
      return { ...card, links } as NoteCard;
    });
  }

  /**
   * Passages, keyed by the reference they hang off.
   *
   * A connection has no id in the reader's model — it is positional inside the
   * card — but a reference holds exactly one passage, so `linkId` identifies
   * it well enough to replace or remove the right one.
   */
  if (pull.connections?.length) {
    cards = cards.map((card) => {
      const mine = pull.connections!.filter((connection) => connection.cardId === card.id);
      if (mine.length === 0) return card;

      const connections: CardConnection[] = [...card.connections];
      for (const wire of mine) {
        /*
         * By id first. Matching on `linkId` alone collapsed every unfiled
         * passage into one — a card with two `linkId: null` connections had the
         * second overwrite the first, and a delete removed whichever came
         * first rather than the one that was deleted.
         */
        const at = connections.findIndex(
          (connection) =>
            (connection.id !== undefined && connection.id === wire._id) ||
            (connection.id === undefined && connection.linkId === wire.linkId),
        );
        if (wire.isDeleted) {
          if (at >= 0) connections.splice(at, 1);
          continue;
        }
        const built: CardConnection = {
          id: wire._id,
          linkId: wire.linkId,
          documentId: wire.documentId,
          paragraphId: wire.paragraphId,
          pageNumber: wire.pageNumber,
          ratioX: wire.ratioX,
          ratioY: wire.ratioY,
        };
        if (at >= 0) connections[at] = built;
        else connections.push(built);
      }
      return { ...card, connections };
    });
  }

  return {
    ...project,
    documents: nextDocuments,
    highlights,
    workspaces: [{ ...workspace, wrappers, cards }],
  };
}
