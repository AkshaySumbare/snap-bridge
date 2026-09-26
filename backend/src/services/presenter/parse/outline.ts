import type { ExtractedPage } from "./pdfExtractor.js";

/** One entry in a document's navigable outline. */
export interface OutlineEntry {
  /** The paragraph this entry jumps to. */
  id: string;
  title: string;
  pageNumber: number;
  /** 0 for a heading, 1 for a numbered clause beneath it. */
  depth: number;
}

/**
 * Clause labels worth listing: "1.1", "2.4", "56.", "(1)(c)".
 *
 * Deliberately not "A." or "(a)" — those are used for sub-points inside a
 * sentence as often as for structure, and listing every one buries the
 * clauses that matter.
 */
const CLAUSE_LABEL = /^(\d+(\.\d+)*\.?|\(\d+\)(\(\w+\))?)$/;

/** How much of a clause's opening reads usefully as a title. */
const TITLE_LIMIT = 64;

export const outlineForPage = (page: ExtractedPage): OutlineEntry[] => {
  const entries: OutlineEntry[] = [];

  for (const paragraph of page.paragraphs) {
    if (paragraph.heading) {
      entries.push({
        id: paragraph.id,
        title: paragraph.text,
        pageNumber: page.pageNumber,
        depth: 0,
      });
      continue;
    }

    if (!paragraph.label || !CLAUSE_LABEL.test(paragraph.label)) continue;

    // The opening sentence fragment reads like a marginal note; the whole
    // clause does not.
    const stop = paragraph.text.indexOf(".");
    const opening = stop > 0 && stop < 70 ? paragraph.text.slice(0, stop) : paragraph.text;

    entries.push({
      id: paragraph.id,
      title: `${paragraph.label} ${opening.slice(0, TITLE_LIMIT).trim()}`,
      pageNumber: page.pageNumber,
      depth: 1,
    });
  }

  return entries;
};
