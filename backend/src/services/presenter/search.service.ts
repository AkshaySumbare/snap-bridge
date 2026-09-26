import mongoose from "mongoose";
import PresenterDocument from "../../models/presenter/presenterDocument.model.js";
import PresenterPage from "../../models/presenter/presenterPage.model.js";
import { PresenterCard } from "../../models/presenter/presenterNodes.model.js";

/**
 * Search across a case: the documents' body text, and the reader's own cards.
 *
 * Server-side because the client's version cannot survive a real bundle —
 * holding every paragraph of a 600-page bundle in memory to grep it is fine
 * for a seeded demo and hopeless for a matter.
 *
 * Offsets come back with each hit so the client can render the same mark it
 * does today without re-finding the needle.
 */

export interface SearchHit {
  kind: "paragraph" | "card";
  documentId: string | null;
  documentTitle: string;
  pageNumber: number | null;
  paragraphId: string | null;
  cardId: string | null;
  snippet: string;
  matchStart: number;
  matchEnd: number;
}

const SNIPPET_RADIUS = 90;

/**
 * The reader's text, as a literal. It goes into `$regex`, and unescaped a
 * query like `(a+)+$` is a pattern the database backtracks through, or an
 * invalid one that turns a search into a 500.
 */
export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const snippetAround = (text: string, index: number, needleLength: number) => {
  const from = Math.max(0, index - SNIPPET_RADIUS);
  const to = Math.min(text.length, index + needleLength + SNIPPET_RADIUS);
  const snippet = (from > 0 ? "…" : "") + text.slice(from, to) + (to < text.length ? "…" : "");
  const matchStart = index - from + (from > 0 ? 1 : 0);
  return { snippet, matchStart, matchEnd: matchStart + needleLength };
};

export const searchPresenter = async (
  presenterId: mongoose.Types.ObjectId,
  query: string,
  limit = 50,
): Promise<SearchHit[]> => {
  const needle = query.trim();
  if (needle.length < 2) return [];
  const lowered = needle.toLowerCase();
  const hits: SearchHit[] = [];

  /*
   * B7 — only documents still in the case, on the parse they are actually on.
   * Pages outlive a removed document (a tombstone, not a purge), so search
   * used to keep finding text in PDFs the reader had deleted.
   */
  const documents = await PresenterDocument.find(
    { presenterId, isDeleted: false, "parse.status": "ready" },
    { title: 1, "parse.version": 1 },
  ).lean();
  const titleById = new Map(documents.map((doc) => [String(doc._id), doc.title]));
  const versionById = new Map(documents.map((doc) => [String(doc._id), doc.parse?.version]));

  // Mongo's text index narrows the candidate pages; the exact offsets still
  // have to be found in the paragraph text, because a text index scores
  // documents and does not say where inside them the words were.
  let pages: Array<{
    documentId: unknown;
    pageNumber: number;
    parseVersion: number;
    paragraphs: Array<{ id: string; text: string }>;
  }> = [];
  try {
    pages = await PresenterPage.find(
      {
        presenterId,
        documentId: { $in: documents.map((doc) => doc._id) },
        $text: { $search: needle },
      },
      { documentId: 1, pageNumber: 1, parseVersion: 1, "paragraphs.id": 1, "paragraphs.text": 1 },
    )
      .limit(limit * 4)
      .lean();
  } catch {
    pages = await PresenterPage.find(
      {
        presenterId,
        documentId: { $in: documents.map((doc) => doc._id) },
        "paragraphs.text": { $regex: escapeRegex(needle), $options: "i" },
      },
      { documentId: 1, pageNumber: 1, parseVersion: 1, "paragraphs.id": 1, "paragraphs.text": 1 },
    )
      .limit(limit * 4)
      .lean();
  }

  for (const page of pages) {
    if (page.parseVersion !== versionById.get(String(page.documentId))) continue;
    for (const paragraph of page.paragraphs) {
      const index = paragraph.text.toLowerCase().indexOf(lowered);
      if (index === -1) continue;
      hits.push({
        kind: "paragraph",
        documentId: String(page.documentId),
        documentTitle: titleById.get(String(page.documentId)) ?? "",
        pageNumber: page.pageNumber,
        paragraphId: paragraph.id,
        cardId: null,
        ...snippetAround(paragraph.text, index, needle.length),
      });
      if (hits.length >= limit) return hits;
    }
  }

  // `.limit(0)` would mean "no limit" to Mongo, not "none left".
  if (hits.length >= limit) return hits;
  const pattern = escapeRegex(needle);
  const cards = await PresenterCard.find(
    {
      presenterId,
      isDeleted: false,
      $or: [
        { text: { $regex: pattern, $options: "i" } },
        { title: { $regex: pattern, $options: "i" } },
      ],
    },
    { text: 1, title: 1 },
  )
    .limit(limit - hits.length)
    .lean();

  for (const card of cards as any[]) {
    const haystack: string = card.text || card.title || "";
    const index = haystack.toLowerCase().indexOf(lowered);
    hits.push({
      kind: "card",
      documentId: null,
      documentTitle: "",
      pageNumber: null,
      paragraphId: null,
      cardId: String(card._id),
      ...snippetAround(haystack, Math.max(index, 0), needle.length),
    });
  }

  return hits;
};
