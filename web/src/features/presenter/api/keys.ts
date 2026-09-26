/** React Query keys for Presenter. Scoped by presenter id so invalidation stays cheap. */
export const presenterKeys = {
  all: ["presenter"] as const,
  list: () => [...presenterKeys.all, "list"] as const,
  item: (presenterId: string) => [...presenterKeys.all, "item", presenterId] as const,
  bootstrap: (presenterId: string) => [...presenterKeys.item(presenterId), "bootstrap"] as const,
  documents: (presenterId: string) => [...presenterKeys.item(presenterId), "documents"] as const,
  downloadUrls: (presenterId: string) => [...presenterKeys.item(presenterId), "download-urls"] as const,
  parseStatus: (presenterId: string, documentId: string) =>
    [...presenterKeys.item(presenterId), "parse-status", documentId] as const,
  pages: (presenterId: string, documentId: string, from: number, to: number) =>
    [...presenterKeys.item(presenterId), "pages", documentId, from, to] as const,
  search: (presenterId: string, query: string) =>
    [...presenterKeys.item(presenterId), "search", query] as const,
  collaborators: (presenterId: string) =>
    [...presenterKeys.item(presenterId), "collaborators"] as const,
};
