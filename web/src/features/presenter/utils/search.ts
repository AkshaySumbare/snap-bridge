/**
 * Project-wide search across document text and workspace cards.
 *
 * Plain substring matching, case-insensitive, over everything the case holds
 * — every document's text and every card on the workspace. There is nothing
 * to narrow it to: a reader searching a case is looking for a phrase, not
 * deciding in advance which half of the screen it is likely to be in, and
 * being shown "no results" for a match sitting in the other half is worse
 * than a slightly longer list.
 */

import type { LiquidProject, SearchHit, Workspace } from "../types";

/** Window of text around a match, so hits read as sentences rather than words. */
function snippetAround(text: string, matchStart: number, matchEnd: number) {
  const radius = 70;
  const from = Math.max(0, matchStart - radius);
  const to = Math.min(text.length, matchEnd + radius);
  const prefix = from > 0 ? "…" : "";
  const suffix = to < text.length ? "…" : "";
  return {
    snippet: `${prefix}${text.slice(from, to)}${suffix}`,
    matchStart: matchStart - from + prefix.length,
    matchEnd: matchEnd - from + prefix.length,
  };
}

interface SearchInput {
  project: LiquidProject;
  query: string;
}

function searchDocuments({ project, query }: SearchInput): SearchHit[] {
  const hits: SearchHit[] = [];
  const documents = project.documents;

  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return hits;

  for (const document of documents) {
    for (const page of document.pages) {
      for (const paragraph of page.paragraphs) {
        const haystack = paragraph.text.toLowerCase();
        let from = haystack.indexOf(needle);
        while (from !== -1) {
          const { snippet, matchStart, matchEnd } = snippetAround(
            paragraph.text,
            from,
            from + needle.length,
          );
          hits.push({
            id: `hit-${document.id}-${paragraph.id}-${from}`,
            kind: "paragraph",
            documentId: document.id,
            documentTitle: document.title,
            pageNumber: page.number,
            paragraphId: paragraph.id,
            cardId: null,
            snippet,
            matchStart,
            matchEnd,
          });
          from = haystack.indexOf(needle, from + needle.length);
        }
      }
    }
  }

  return hits;
}

function cardText(card: Workspace["cards"][number]): string {
  return card.text;
}

function searchWorkspaces({ project, query }: SearchInput): SearchHit[] {
  const hits: SearchHit[] = [];
  const workspaces = project.workspaces;

  const needle = query.trim().toLowerCase();

  for (const workspace of workspaces) {
    for (const card of workspace.cards) {
      const text = cardText(card);

      if (needle.length === 0) continue;
      const at = text.toLowerCase().indexOf(needle);
      if (at === -1) continue;

      const { snippet, matchStart, matchEnd } = snippetAround(text, at, at + needle.length);
      hits.push({
        id: `hit-card-${card.id}-${at}`,
        kind: "card",
        documentId: card.kind === "excerpt" ? card.documentId : null,
        documentTitle: workspace.name,
        pageNumber: card.kind === "excerpt" ? card.pageNumber : null,
        paragraphId: null,
        cardId: card.id,
        snippet,
        matchStart,
        matchEnd,
      });
    }
  }

  return hits;
}

export function searchProject(input: SearchInput): SearchHit[] {
  if (input.query.trim().length === 0) return [];

  // Documents first: a phrase in the material is what the reader is usually
  // after, and their own cards are the shorter list to scroll past.
  return [...searchDocuments(input), ...searchWorkspaces(input)];
}
