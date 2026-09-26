/**
 * What changed since the last push.
 *
 * The store is the reader's working copy and it does not track what is dirty —
 * forty-odd mutations each remembering to mark themselves would be forty
 * chances to forget. Instead the last-pushed state is kept as a snapshot and
 * diffed, so a change is detected by being different rather than by being
 * announced.
 *
 * Nodes are flattened out of the nested UI shape into the flat collections the
 * sync endpoint takes, and **layout is not sent**: `x`, `y`, `width` and
 * `collapsed` are the reader's view of their canvas, not server state.
 */

import type { Highlight, LiquidProject, NoteCard, Workspace } from "../types";
import type { SyncChanges } from "./presenter-api";

export interface SyncSnapshot {
  /** Node id → its serialised form, for equality by value. */
  nodes: Map<string, string>;
}

interface FlatNode {
  entity: keyof SyncChanges;
  id: string;
  body: Record<string, unknown>;
}

/**
 * The canvas itself is not a node — Points and arguments scope to the case
 * directly, so there is nothing above them to send.
 */
const flattenWorkspace = (workspace: Workspace): FlatNode[] => {
  const nodes: FlatNode[] = [];

  workspace.wrappers.forEach((wrapper, order) => {
    nodes.push({
      entity: "wrappers",
      id: wrapper.id,
      body: { title: wrapper.title, order },
    });
  });

  workspace.cards.forEach((card, order) => {
    nodes.push({
      entity: "cards",
      id: card.id,
      body: {
        kind: card.kind,
        wrapperId: card.wrapperId,
        order,
        title: card.kind === "note" ? card.title : "",
        text: card.text,
        color: card.color,
        placement: card.placement,
        documentId: card.kind === "excerpt" ? card.documentId : (card.source?.documentId ?? null),
        pageNumber: card.kind === "excerpt" ? card.pageNumber : (card.source?.pageNumber ?? null),
        highlightId:
          card.kind === "excerpt" ? card.highlightId : (card.source?.highlightId ?? null),
      },
    });

    if (card.kind === "note") {
      (card as NoteCard).links.forEach((link, linkOrder) => {
        nodes.push({
          entity: "links",
          id: link.id,
          body: {
            cardId: card.id,
            label: link.label,
            documentIds: link.documentIds,
            order: linkOrder,
          },
        });
      });
    }

    card.connections.forEach((connection, index) => {
      /*
       * The server's own id wherever there is one.
       *
       * Falling back to the positional derivation for a passage that has never
       * synced is fine — it is stable for as long as the index is, and it is
       * idempotent across a retry. What is not fine is deriving one for a
       * passage the server already named: the derived id would not match, so
       * the edit would insert a duplicate and tombstone a row another device
       * can see.
       */
      const id = connection.id ?? connectionId(card.id, connection.linkId, index);
      nodes.push({
        entity: "connections",
        id,
        body: {
          cardId: card.id,
          linkId: connection.linkId,
          // The passage's document, carried on the connection itself. Reading
          // it off the card sent "" for any argument created from scratch,
          // and the wrong document for one that points across several.
          documentId: connection.documentId,
          pageNumber: connection.pageNumber,
          paragraphId: connection.paragraphId,
          ratioX: connection.ratioX,
          ratioY: connection.ratioY,
        },
      });
    });
  });

  return nodes;
};

/**
 * A ULID-shaped id for a connection, derived from its card and reference.
 *
 * The sync endpoint requires client-generated ULIDs, and a connection is the
 * one node the UI models positionally rather than by id. Deriving it keeps a
 * re-push idempotent: the same passage under the same reference produces the
 * same id every time, so it updates rather than duplicating.
 */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function connectionId(cardId: string, linkId: string | null, index: number): string {
  const seed = `${cardId}:${linkId ?? "unfiled"}:${index}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let out = "";
  let value = hash;
  for (let i = 0; i < 26; i += 1) {
    out = CROCKFORD[value % 32] + out;
    value = Math.floor(value / 32) || (hash >>> (i % 24)) + i + 1;
  }
  return out.slice(0, 26);
}

const flattenHighlights = (highlights: Highlight[]): FlatNode[] =>
  highlights.map((highlight) => ({
    entity: "highlights" as const,
    id: highlight.id,
    body: {
      documentId: highlight.documentId,
      pageNumber: highlight.pageNumber,
      paragraphId: highlight.paragraphId,
      start: highlight.start,
      end: highlight.end,
      color: highlight.color,
      text: highlight.text,
    },
  }));

/**
 * Only the two collections that are synced, so a caller can pass the case as
 * the server sent it — which has no local `updatedAt` — as readily as the
 * store's copy.
 */
type SyncableProject = Pick<LiquidProject, "workspaces" | "highlights">;

export const flattenProject = (project: SyncableProject): FlatNode[] => [
  ...project.workspaces.flatMap(flattenWorkspace),
  ...flattenHighlights(project.highlights),
];

export const snapshotOf = (project: SyncableProject): SyncSnapshot => ({
  nodes: new Map(flattenProject(project).map((node) => [node.id, JSON.stringify(node.body)])),
});

export const emptySnapshot = (): SyncSnapshot => ({ nodes: new Map() });

/**
 * Changes to push, and the snapshot to keep if they land.
 *
 * A node that is gone from the project is sent as a tombstone rather than
 * simply dropped — a delete nobody is told about is a delete that comes back
 * on the next device's pull.
 */
export function diffForSync(
  project: LiquidProject,
  previous: SyncSnapshot,
): { changes: SyncChanges; next: SyncSnapshot; count: number } {
  const flat = flattenProject(project);
  const next = new Map<string, string>();
  const changes: SyncChanges = {};
  const now = new Date().toISOString();
  let count = 0;

  const push = (entity: keyof SyncChanges, body: Record<string, unknown>) => {
    (changes[entity] ??= []).push(body);
    count += 1;
  };

  const entityById = new Map<string, keyof SyncChanges>();
  for (const node of flat) {
    const serialised = JSON.stringify(node.body);
    next.set(node.id, serialised);
    entityById.set(node.id, node.entity);
    if (previous.nodes.get(node.id) !== serialised) {
      push(node.entity, { _id: node.id, lastModifiedAt: now, ...node.body });
    }
  }

  for (const [id, serialised] of previous.nodes) {
    if (next.has(id)) continue;
    // Entity is recoverable from the snapshot's own record of it; without it
    // the tombstone has no collection to go to.
    const body = JSON.parse(serialised) as Record<string, unknown>;
    const entity = guessEntity(body);
    if (!entity) continue;
    push(entity, { _id: id, lastModifiedAt: now, isDeleted: true, ...body });
  }

  return { changes, next: { nodes: next }, count };
}

/** Which collection a snapshot row belonged to, from the shape of its body. */
function guessEntity(body: Record<string, unknown>): keyof SyncChanges | null {
  if ("start" in body && "end" in body) return "highlights";
  if ("ratioX" in body) return "connections";
  if ("documentIds" in body) return "links";
  if ("kind" in body) return "cards";
  if ("title" in body) return "wrappers";
  return null;
}
