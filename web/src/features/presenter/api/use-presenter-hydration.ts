/**
 * Loads a case from the server into the workspace store.
 *
 * Opening a case fills the store from the server — there is nothing local to
 * fall back on. Bootstrap deliberately carries no paragraphs: a bundle's text
 * runs to megabytes and the reader only ever renders a slice of it.
 *
 * Page text is *not* fetched here. It used to be, for every selected document
 * at once, which is how opening a case of ten documents fired ten
 * simultaneous `pages?from=1&to=25` requests — nine of them for text sitting
 * far below the fold. The reader asks for its own pages now, one document at
 * a time as each comes into view (`usePageLoader`), so what is fetched is
 * what is about to be looked at.
 */

import { useEffect, useRef, useState } from "react";

import type { LiquidProject } from "../types";
import { useLiquidTextStore } from "../stores/liquid-text-store";
import { mapDocument, mapHighlight, mapWorkspace } from "./mappers";
import { useBootstrap } from "./use-presenter";

export interface PresenterHydration {
  ready: boolean;
  loading: boolean;
  error: unknown;
  /** Sync cursor from the bootstrap — what the first push sends as `since`. */
  cursor: string | null;
  /**
   * Counts hydrations, and is 0 until the first one lands.
   *
   * A counter rather than the server's timestamp, because two answers can
   * carry the same one and this has to change every time — the sync baseline
   * keys off it. The sync hook re-baselines because
   * hydration replaces the project, and a diff against the baseline from
   * before that would read the replacement as the reader deleting their own
   * work and push tombstones for it.
   */
  hydratedAt: number;
  /**
   * The project exactly as the server sent it, before the reader touched it.
   *
   * Sync needs this and cannot get it from the store: it takes its baseline a
   * render or more after hydration, and by then the store may already hold
   * work of the reader's own. Folding that into the baseline makes it look
   * like something the server already has, and nothing ever pushes it.
   */
  hydratedProject: Omit<LiquidProject, "updatedAt"> | null;
  retry: () => void;
}

export function usePresenterHydration(presenterId: string | null): PresenterHydration {
  const bootstrap = useBootstrap(presenterId);
  const hydrateFromServer = useLiquidTextStore((state) => state.hydrateFromServer);

  /**
   * Hydrate once per server answer — not once per case.
   *
   * Keyed on the case id alone, stepping back into a case hydrated from
   * whatever React Query still held and then ignored the fresh answer when it
   * arrived: the request went out, and its result was dropped on the floor.
   *
   * Re-running on the *same* answer is what must not happen — that would
   * throw away whatever the reader has done since it landed.
   */
  const hydratedFor = useRef<string | null>(null);
  const hydratedRef = useRef(0);
  const hydratedProjectRef = useRef<Omit<LiquidProject, "updatedAt"> | null>(null);
  /**
   * State, not just a ref, because the sync baseline has to re-run when this
   * moves — and a ref changing does not re-run anything.
   */
  const [hydratedAt, setHydratedAt] = useState(0);
  useEffect(() => {
    if (!presenterId || !bootstrap.data) return;
    /**
     * Never hydrate from data a refetch is already replacing.
     *
     * Coming back, React Query hands over the last answer immediately and the
     * fresh one a moment later. Taking both meant hydrating twice, and since
     * hydration blanks the page text, it meant fetching every document's
     * pages twice to show the same words. With `staleTime: 0` anything held
     * while a fetch is in flight is stale by definition, so it is skipped and
     * the reader is hydrated once, from the answer that is actually current.
     */
    if (bootstrap.isFetching) return;
    if (hydratedFor.current === presenterId && hydratedRef.current === bootstrap.dataUpdatedAt) return;
    hydratedFor.current = presenterId;
    hydratedRef.current = bootstrap.dataUpdatedAt;
    /*
     * Hydration replaces the project, and the documents it brings carry no
     * text — bootstrap omits paragraphs deliberately, since a bundle runs to
     * megabytes. Whatever was fetched is therefore blank again, and the
     * reader re-asks for the window it is actually looking at.
     */
    setHydratedAt((generation) => generation + 1);

    const wire = bootstrap.data;
    const project: Omit<LiquidProject, "updatedAt"> = {
      id: presenterId,
      name: wire.case?.name ?? "",
      documents: wire.documents.map(mapDocument),
      highlights: wire.highlights.map(mapHighlight),
      workspaces: [mapWorkspace(wire, presenterId)],
    };
    hydratedProjectRef.current = project;
    hydrateFromServer(project);
  }, [presenterId, bootstrap.data, bootstrap.dataUpdatedAt, bootstrap.isFetching, hydrateFromServer]);

  // A new case starts clean: nothing hydrated.
  useEffect(() => {
    hydratedFor.current = null;
    hydratedRef.current = 0;
    hydratedProjectRef.current = null;
  }, [presenterId]);

  return {
    /*
     * `hydratedAt` as well as the ref, because the two do not become true on
     * the same render and the gap is a race the reader can lose.
     *
     * The ref is set inside the effect; the counter is state, so it reaches
     * anyone reading it one render later. Sync starts on `ready` and takes
     * its baseline from `hydratedAt`, so a reader who annotated in that gap
     * had their annotation folded into the baseline as if the server had sent
     * it — a highlight on screen that no push would ever carry. Waiting for
     * the counter costs a render and makes the two agree.
     */
    ready: bootstrap.isSuccess && hydratedFor.current === presenterId && hydratedAt > 0,
    loading: bootstrap.isPending,
    error: bootstrap.error,
    cursor: bootstrap.data?.cursor ?? null,
    hydratedAt,
    hydratedProject: hydratedProjectRef.current,
    retry: () => void bootstrap.refetch(),
  };
}
