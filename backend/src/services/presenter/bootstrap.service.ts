import mongoose from "mongoose";
import Presenter from "../../models/presenter/presenter.model.js";
import PresenterDocument from "../../models/presenter/presenterDocument.model.js";
import { presentParse } from "./parse/parseStatus.js";
import { ENTITIES, ENTITY_ORDER } from "./registry.js";
import { readVisibleSeq } from "./seq.js";

/**
 * Everything needed to open a case, in one call.
 *
 * Seven collections read in parallel rather than seven round trips from the
 * client — the rail, the reader and the canvas all mount together instead of
 * appearing one after another down a spinner cascade.
 *
 * Page text is deliberately absent. A bundle's paragraphs run to megabytes;
 * the reader fetches the range it is showing, and mobile takes the whole thing
 * as one blob download instead.
 */

export interface BootstrapResult {
  serverTime: string;
  cursor: string;
  /**
   * The case itself. Included so opening one is genuinely a single call — the
   * reader has to be told which case they are in, and making the client
   * remember it from the list it came from breaks a deep link.
   */
  case: { id: string; name: string; client: string } | null;
  documents: unknown[];
  wrappers: unknown[];
  cards: unknown[];
  links: unknown[];
  connections: unknown[];
  highlights: unknown[];
}

export const bootstrapPresenter = async (
  presenterId: mongoose.Types.ObjectId,
  viewerId: mongoose.Types.ObjectId,
): Promise<BootstrapResult> => {
  /**
   * The cursor is read FIRST, and awaited, before any row is read.
   *
   * It is the visible ceiling — the highest sequence whose rows are all
   * written (see `seq.ts`). Everything at or below it is already in the
   * database, so the reads below include it; anything landing while they run
   * carries a higher sequence and arrives on the next delta. Reading it in
   * the same `Promise.all` as the rows gave no such ordering, and the raw
   * `case.seq` can name a batch that is still being written (A1).
   */
  const { visible } = await readVisibleSeq(presenterId);
  const [caseRow, documents, ...nodeSets] = await Promise.all([
    Presenter.findById(presenterId, { name: 1, client: 1 }).lean(),
    PresenterDocument.find({ presenterId, isDeleted: false }).sort({ order: 1 }).lean(),
    ...ENTITY_ORDER.map((entity) =>
      ENTITIES[entity].model
        .find({
          presenterId,
          isDeleted: false,
          // A4 — someone else's private highlight is not in your case.
          ...(entity === "highlights"
            ? { $or: [{ visibility: { $ne: "private" } }, { createdBy: viewerId }] }
            : {}),
        })
        .lean(),
    ),
  ]);

  const byEntity = Object.fromEntries(
    ENTITY_ORDER.map((entity, index) => [entity, nodeSets[index] ?? []]),
  ) as Record<(typeof ENTITY_ORDER)[number], unknown[]>;

  return {
    serverTime: new Date().toISOString(),
    cursor: String(visible),
    case: caseRow
      ? { id: String(caseRow._id), name: caseRow.name, client: caseRow.client }
      : null,
    // Derived, not stored — see `effectiveParseStatus`.
    documents: documents.map((document) => ({
      ...document,
      parse: presentParse(document.parse),
    })),
    wrappers: byEntity.wrappers,
    cards: byEntity.cards,
    links: byEntity.links,
    connections: byEntity.connections,
    highlights: byEntity.highlights,
  };
};
