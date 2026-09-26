/**
 * React Query hooks for Presenter.
 *
 * The feature has no offline seed: everything on screen came from one of
 * these, so a failure here is a failure the reader has to be told about
 * rather than something to paper over with placeholder content.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createPresenter,
  deletePresenter,
  deleteDocument,
  fetchBootstrap,
  fetchCollaborators,
  fetchPresenters,
  fetchParseStatus,
  retryParse,
  sharePresenter,
  unsharePresenter,
  updatePresenter,
  updateDocument,
  uploadDocument,
} from "./presenter-api";
import { presenterKeys } from "./keys";
import { flushPendingWrites } from "./sync-gate";

export function usePresenterCollaborators(presenterId: string | null, enabled = true) {
  return useQuery({
    queryKey: presenterKeys.collaborators(presenterId ?? ""),
    queryFn: ({ signal }) => fetchCollaborators(presenterId as string, signal),
    enabled: enabled && Boolean(presenterId),
  });
}

export function usePresenters() {
  return useQuery({
    queryKey: presenterKeys.list(),
    queryFn: ({ signal }) => fetchPresenters(signal),
  });
}

export function useCreatePresenter() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createPresenter,
    onSuccess: () => client.invalidateQueries({ queryKey: presenterKeys.list() }),
  });
}

export function useUpdatePresenter() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { presenterId: string; patch: Parameters<typeof updatePresenter>[1] }) =>
      updatePresenter(input.presenterId, input.patch),
    onSuccess: () => client.invalidateQueries({ queryKey: presenterKeys.list() }),
  });
}

/**
 * Grant or revoke access, owner only.
 *
 * Both invalidate the case list, because `sharedWith` is what the tile reads
 * to show who is in — an optimistic guess here would be a guess about
 * permissions, which is the last thing to be casual about.
 */
export function useSharePresenter() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { presenterId: string; userIds: string[] }) =>
      sharePresenter(input.presenterId, input.userIds),
    onSuccess: (_data, input) => {
      client.invalidateQueries({ queryKey: presenterKeys.list() });
      client.invalidateQueries({ queryKey: presenterKeys.collaborators(input.presenterId) });
    },
  });
}

export function useUnsharePresenter() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { presenterId: string; userId: string }) =>
      unsharePresenter(input.presenterId, input.userId),
    onSuccess: (_data, input) => {
      client.invalidateQueries({ queryKey: presenterKeys.list() });
      client.invalidateQueries({ queryKey: presenterKeys.collaborators(input.presenterId) });
    },
  });
}

export function useDeletePresenter() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: deletePresenter,
    onSuccess: () => client.invalidateQueries({ queryKey: presenterKeys.list() }),
  });
}

/**
 * Everything needed to open a case.
 *
 * Re-read every time the reader opens one, rather than served from cache.
 * Cached, going back and stepping into the same case showed the canvas as it
 * was when the tab was first loaded — the reader's own last edits missing,
 * and only a hard refresh to fix it.
 *
 * `settledWrites` orders that read after the flush the previous visit queued
 * on its way out, so the answer includes the reader's own last edit rather
 * than racing it.
 *
 * Focus refetching stays off. Alt-tabbing to check a date is not the same
 * gesture as opening the case, and this response replaces the canvas.
 */
export function useBootstrap(presenterId: string | null) {
  return useQuery({
    queryKey: presenterKeys.bootstrap(presenterId ?? ""),
    queryFn: async ({ signal }) => {
      /*
       * Flush first, then read — not merely "wait for whatever was queued".
       *
       * This response replaces the project and re-seeds the sync baseline, so
       * anything the reader has not pushed yet would be diffed away by the
       * hydration that follows. Pushing it first makes the server's answer
       * include it, which is the only ordering where the two cannot disagree.
       */
      await flushPendingWrites();
      return fetchBootstrap(presenterId as string, signal);
    },
    enabled: Boolean(presenterId),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    /*
     * A reconnect is not the gesture that means "open this case".
     *
     * Losing Wi-Fi in a lift and getting it back used to fire this query, and
     * because it replaces the canvas, every annotation made during the drop
     * vanished from the screen while the chip said "saved". The sync loop is
     * what recovers from a network gap; it retries on its own and carries the
     * reader's work with it.
     */
    refetchOnReconnect: false,
  });
}

export function useUploadDocument(presenterId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { file: File; folderId?: string | null }) =>
      uploadDocument(presenterId, input.file, input.folderId ?? null),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: presenterKeys.documents(presenterId) }),
        /**
         * And the signed URLs, which are cached for the reading session.
         *
         * They are fetched once per case and held for hours, so a document
         * uploaded afterwards was not in that answer — the reader fell back
         * to typeset text and only showed the real PDF after a hard refresh.
         */
        client.invalidateQueries({ queryKey: presenterKeys.downloadUrls(presenterId) }),
      ]),
  });
}

export function useUpdateDocument(presenterId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { documentId: string; patch: Parameters<typeof updateDocument>[2] }) =>
      updateDocument(presenterId, input.documentId, input.patch),
    onSuccess: () => client.invalidateQueries({ queryKey: presenterKeys.documents(presenterId) }),
  });
}

export function useDeleteDocument(presenterId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => deleteDocument(presenterId, documentId),
    onSuccess: () => client.invalidateQueries({ queryKey: presenterKeys.documents(presenterId) }),
  });
}

/**
 * Poll a freshly uploaded document until extraction finishes.
 *
 * Stops polling on any terminal state — including `stalled`, which is a parse
 * whose process died. Nothing retries on its own upstream, so the UI shows a
 * retry rather than a spinner that will never stop.
 */
export function useParseStatus(presenterId: string, documentId: string | null, active: boolean) {
  return useQuery({
    queryKey: presenterKeys.parseStatus(presenterId, documentId ?? ""),
    queryFn: ({ signal }) => fetchParseStatus(presenterId, documentId as string, signal),
    enabled: Boolean(documentId) && active,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" || status === "running" ? 2000 : false;
    },
  });
}

export function useRetryParse(presenterId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => retryParse(presenterId, documentId),
    onSuccess: (_result, documentId) =>
      Promise.all([
        client.invalidateQueries({ queryKey: presenterKeys.documents(presenterId) }),
        /**
         * And the status poll, which has stopped.
         *
         * `useParseStatus` only keeps asking while a parse is pending or
         * running, so by the time the reader sees a failure it has gone quiet
         * — and a retry that does not wake it leaves the rail spinning on the
         * optimistic "Reading…" forever, with nothing left to correct it.
         * Invalidating puts the query back in flight; its answer is `pending`,
         * and the interval starts again from there.
         */
        client.invalidateQueries({ queryKey: presenterKeys.parseStatus(presenterId, documentId) }),
      ]),
  });
}
