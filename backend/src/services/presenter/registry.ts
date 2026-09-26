import { Model } from "mongoose";
import {
  PresenterCard,
  PresenterConnection,
  PresenterHighlight,
  PresenterLink,
  PresenterWrapper,
} from "../../models/presenter/presenterNodes.model.js";

/**
 * What the sync engine needs to know about each collection.
 *
 * `ENTITY_ORDER` is the order the batch is applied in, and it is not
 * cosmetic: a reader on a plane creates a Point, an argument inside it, a
 * reference on that argument and a connection on that reference, then syncs
 * the lot in one payload. Writing children before parents would reject every
 * one of them for a parent that is three lines further down the same request.
 */

export type PresenterEntity =
  | "wrappers"
  | "cards"
  | "links"
  | "connections"
  | "highlights";

export interface ParentRule {
  /** Field on the child holding the parent's id. */
  field: string;
  /** Collection the id must exist in. */
  entity: PresenterEntity;
  /** A null value is allowed — a loose card belongs to no Point. */
  nullable: boolean;
}

export interface EntitySpec {
    model: Model<unknown>;
  /** Fields the client owns. Anything not listed here cannot be written by a sync. */
  mutableFields: readonly string[];
  parents: readonly ParentRule[];
  /**
   * Counter on the case that this collection feeds, if any.
   *
   * Set only where the number is shown somewhere expensive to compute — the
   * landing tiles. Everything else is counted on demand.
   */
  countsInto?: "documentCount" | "excerptCount";
  /**
   * Fields the client sends as ObjectId strings.
   *
   * The write path is an aggregation-pipeline update, which bypasses
   * Mongoose casting entirely — whatever JSON arrives is what lands in the
   * document. Left alone, `documentId` stores as a string while `presenterId`,
   * which the server sets, stores as an ObjectId, and any later query by
   * ObjectId silently matches nothing.
   */
  objectIdFields?: readonly string[];
  /**
   * Fields a NEW row cannot exist without. An insert missing one is rejected
   * `MISSING_<FIELD>` instead of being stored half-built — the pipeline write
   * bypasses Mongoose validation, so nothing else would catch it, and every
   * other client would then receive a row it cannot parse.
   *
   * Updates to an existing row may still send only what changed.
   */
  requiredOnInsert: readonly string[];
  /**
   * What a new row gets for a field the client did not send — the model's own
   * defaults, which a pipeline upsert would otherwise never apply.
   */
  insertDefaults: Readonly<Record<string, unknown>>;
  /**
   * Field holding the Presenter document this node is anchored into. A node
   * anchored into a document that is gone is rejected (`PARENT_MISSING` /
   * `PARENT_DELETED`) rather than stored as an orphan every client has to hide.
   *
   * Deliberately not set on cards: a note citing a removed document is kept
   * (it is the reader's own writing), so its edits must keep landing.
   */
  documentField?: string;
}

/** Dependency order. Parents first, always. */
export const ENTITY_ORDER: readonly PresenterEntity[] = [
  "wrappers",
  "cards",
  "links",
  "connections",
  "highlights",
];

export const ENTITIES: Record<PresenterEntity, EntitySpec> = {
  wrappers: {
    model: PresenterWrapper,
    mutableFields: ["title", "order"],
    parents: [],
    requiredOnInsert: [],
    insertDefaults: { title: "", order: 0 },
  },
  cards: {
    model: PresenterCard,
    objectIdFields: ["documentId"],
    mutableFields: [
      "kind",
      "wrapperId",
      "order",
      "title",
      "text",
      "color",
      "placement",
      "documentId",
      "pageNumber",
      "highlightId",
    ],
    parents: [{ field: "wrapperId", entity: "wrappers", nullable: true }],
    requiredOnInsert: ["kind"],
    insertDefaults: {
      wrapperId: null,
      order: 0,
      title: "",
      text: "",
      color: "clear",
      placement: "canvas",
      documentId: null,
      pageNumber: null,
      highlightId: null,
    },
  },
  links: {
    model: PresenterLink,
    objectIdFields: ["documentIds"],
    mutableFields: ["cardId", "label", "documentIds", "order"],
    parents: [{ field: "cardId", entity: "cards", nullable: false }],
    requiredOnInsert: ["cardId"],
    insertDefaults: { label: "", documentIds: [], order: 0 },
  },
  connections: {
    model: PresenterConnection,
    objectIdFields: ["documentId"],
    mutableFields: [
      "cardId",
      "linkId",
      "documentId",
      "pageNumber",
      "paragraphId",
      "parseVersion",
      "ratioX",
      "ratioY",
    ],
    parents: [
      { field: "cardId", entity: "cards", nullable: false },
      { field: "linkId", entity: "links", nullable: true },
    ],
    requiredOnInsert: ["cardId", "documentId", "pageNumber", "paragraphId", "ratioX", "ratioY"],
    insertDefaults: { linkId: null, parseVersion: 1 },
    documentField: "documentId",
  },
  highlights: {
    model: PresenterHighlight,
    countsInto: "excerptCount",
    objectIdFields: ["documentId"],
    mutableFields: [
      "documentId",
      "pageNumber",
      "paragraphId",
      "parseVersion",
      "start",
      "end",
      "color",
      "text",
      "visibility",
    ],
    parents: [],
    requiredOnInsert: ["documentId", "pageNumber", "paragraphId", "start", "end", "color"],
    insertDefaults: { parseVersion: 1, text: "", visibility: "shared" },
    documentField: "documentId",
  },
};
