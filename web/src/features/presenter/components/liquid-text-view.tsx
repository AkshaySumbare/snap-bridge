/**
 * Root of the feature: the reader's cases, or the three-pane workspace once
 * a case is open.
 *
 * This component owns the overlay that both panes share, because the
 * connector layer has to measure across them — the reader and the canvas are
 * independent scrollers and neither can host a line that runs between them.
 */

import { FileText, Layers, PanelsTopLeft } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useNarrowLayout } from "../hooks/use-narrow-layout";
import { cn } from "@/lib/utils";

import { usePresenterHydration } from "../api/use-presenter-hydration";
import { usePresenterSync } from "../api/use-presenter-sync";
import { usePresenters } from "../api/use-presenter";
import { PresenterShareDialog } from "./presenter-share-dialog";
import { useConnectorAnchors } from "../hooks/use-connector-anchors";
import { useLiquidTextStore } from "../stores/liquid-text-store";
import { useLiquidTextUiStore, type MobilePane } from "../stores/liquid-text-ui-store";
import { ConnectorLayer } from "./connector-layer";
import { DocumentRail } from "./document-rail";
import { LiquidTextModals } from "./liquid-text-modals";
import { MarginNoteLayer } from "./margin-note-layer";
import { LiquidTextErrorBoundary } from "./liquid-text-error-boundary";
import { ReaderPane } from "./reader-pane";
import { SearchPanel } from "./search-panel";
import { PassageToolbar } from "./passage-toolbar";
import { WorkspaceCanvas } from "./workspace-canvas";

const MOBILE_PANES = [
  { id: "documents" as const, label: "Documents", icon: PanelsTopLeft },
  { id: "reader" as const, label: "Reader", icon: FileText },
  { id: "workspace" as const, label: "Workspace", icon: Layers },
];

function LiquidTextWorkspace() {
  const { presenterId: openPresenterId } = useParams();
  const navigate = useNavigate();
  const goHome = () => navigate("/presenter");
  const [sharingOpen, setSharingOpen] = useState(false);
  const presenterList = usePresenters();
  const presenterMeta = useMemo(
    () => presenterList.data?.find((entry) => entry.id === openPresenterId) ?? null,
    [presenterList.data, openPresenterId],
  );
  const shareTarget =
    sharingOpen && presenterMeta?.isOwner
      ? {
          id: presenterMeta.id,
          name: presenterMeta.name,
          sharedWith: presenterMeta.sharedWith,
        }
      : null;
  const project = useLiquidTextStore((state) => state.project);
  const removeCardConnection = useLiquidTextStore((state) => state.removeCardConnection);
  const activeWorkspaceId = useLiquidTextStore((state) => state.activeWorkspaceId);
  const activeDocumentId = useLiquidTextStore((state) => state.activeDocumentId);
  const selectedDocumentIds = useLiquidTextStore((state) => state.selectedDocumentIds);

  const panel = useLiquidTextUiStore((state) => state.panel);
  const canvasZoom = useLiquidTextUiStore((state) => state.canvasZoom);
  const canvasCollapsed = useLiquidTextUiStore((state) => state.canvasCollapsed);
  const railCollapsed = useLiquidTextUiStore((state) => state.railCollapsed);
  const highlightViewOpen = useLiquidTextUiStore((state) => state.highlightViewOpen);
  const spotlightCardId = useLiquidTextUiStore((state) => state.spotlightCardId);
  const connectorCardIds = useLiquidTextUiStore((state) => state.connectorCardIds);
  const openLinkKey = useLiquidTextUiStore((state) => state.openLinkKey);
  const mobilePane = useLiquidTextUiStore((state) => state.mobilePane);
  const setMobilePane = useLiquidTextUiStore((state) => state.setMobilePane);

  /*
    Below `lg` the three panes cannot sit side by side — the rail alone is
    248px and the canvas will not go under 320px — so one shows at a time and
    a bar at the bottom switches between them. Everything stays reachable;
    only how much is on screen at once changes.
  */
  const isNarrow = useNarrowLayout();

  const overlayRef = useRef<HTMLDivElement>(null);

  const hydration = usePresenterHydration(openPresenterId ?? null);
  /**
   * Push the reader's work back, debounced. Only once the case has actually
   * hydrated — starting before that would diff against an empty baseline and
   * re-send the whole case as if it had just been typed.
   */
  const sync = usePresenterSync(
    openPresenterId ?? null,
    hydration.cursor,
    hydration.ready,
    hydration.hydratedAt,
    hydration.hydratedProject,
  );

  const workspace =
    project.workspaces.find((entry) => entry.id === activeWorkspaceId) ?? project.workspaces[0];

  // Comments still docked on the seam: notes of the open workspace whose
  // passage lives in the open document.
  const marginNotes = useMemo(() => {
    const documentHighlightIds = new Set(
      project.highlights
        .filter((highlight) => selectedDocumentIds.includes(highlight.documentId))
        .map((highlight) => highlight.id),
    );
    return (workspace?.cards ?? []).filter(
      (card): card is Extract<typeof card, { kind: "note" }> =>
        card.kind === "note" &&
        card.placement === "margin" &&
        card.source !== null &&
        card.source.highlightId !== null &&
        documentHighlightIds.has(card.source.highlightId),
    );
  }, [workspace?.cards, project.highlights, selectedDocumentIds]);

  // Anything that can move an anchor invalidates the measured positions.
  const anchorRevision = useMemo(
    () => [
      project.workspaces,
      project.highlights,
      activeDocumentId,
      selectedDocumentIds,
      activeWorkspaceId,
      canvasZoom,
      canvasCollapsed,
      railCollapsed,
      highlightViewOpen,
      panel,
      connectorCardIds,
      openLinkKey,
    ],
    [
      project.workspaces,
      project.highlights,
      activeDocumentId,
      selectedDocumentIds,
      activeWorkspaceId,
      canvasZoom,
      canvasCollapsed,
      railCollapsed,
      highlightViewOpen,
      panel,
      connectorCardIds,
      openLinkKey,
    ],
  );

  // Notes pinned to a bare point need their paragraph measured too — the
  // highlight sweep can't see them, because there is no highlight.
  const passageAnchors = useMemo(
    () =>
      (workspace?.cards ?? []).flatMap((card) => [
        ...(card.kind === "note" && card.source?.anchor ? [card.source.anchor] : []),
        ...card.connections,
      ]),
    [workspace?.cards],
  );

  const anchors = useConnectorAnchors(overlayRef, passageAnchors, anchorRevision);

  /*
    `lg:contents` sits in the caller so it applies whatever this returns; here
    we only decide which pane a narrow screen is showing.
  */
  const paneClass = (pane: MobilePane) => (mobilePane === pane ? "flex" : "hidden");

  if (!openPresenterId) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-base">
        <p className="text-sm text-text-muted">Presenter not found.</p>
      </div>
    );
  }

  if (hydration.loading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-base">
        <p className="text-sm text-text-muted">Opening presenter…</p>
      </div>
    );
  }

  if (hydration.error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface-base">
        <p className="text-sm font-medium text-foreground">Could not open this presenter.</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={hydration.retry}
            className="rounded-md border border-border-default px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-sunken"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={goHome}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-sunken"
          >
            Back to library
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-base">
      {/*
        No top toolbar: Home/Undo/Redo/Share/Search
        all live in the rail's Settings dropdown now, so the app-level
        controls sit with the rest of the workspace chrome instead of a
        separate header row.
      */}
      <div ref={overlayRef} className="relative flex min-h-0 flex-1 overflow-hidden">
        {/*
          Each pane is wrapped rather than hidden directly, so the wrapper can
          carry the show/hide. From `lg` up the wrapper is `display: contents`
          and disappears from the layout entirely — the desktop row is exactly
          the three panes it always was.

          Hidden, not unmounted: switching panes on a phone would otherwise
          drop the reader's scroll position and re-fetch the pages it had
          already painted.
        */}
        <div className={cn("min-h-0 flex-1 lg:contents", paneClass("documents"))}>
          <DocumentRail
            onExit={goHome}
            canShare={presenterMeta?.isOwner ?? false}
            onShare={() => setSharingOpen(true)}
          />
        </div>
        <div className={cn("min-h-0 flex-1 lg:contents", paneClass("reader"))}>
          <ReaderPane />
        </div>
        <div className={cn("min-h-0 flex-1 lg:contents", paneClass("workspace"))}>
          {panel === "search" ? <SearchPanel /> : <WorkspaceCanvas sync={sync} />}
        </div>

        {/*
          Connectors and margin notes are drawn between panes. On a phone the
          panes are never on screen together, so there is no seam to draw
          across and both are left off.
        */}
        {!isNarrow && workspace && (
          <ConnectorLayer
            anchors={anchors}
            cards={workspace.cards}
            spotlightCardId={spotlightCardId}
            visibleCardIds={connectorCardIds}
            openLinkKey={openLinkKey}
            onRemoveConnection={removeCardConnection}
          />
        )}

        {!isNarrow && (
          <MarginNoteLayer overlayRef={overlayRef} notes={marginNotes} revision={anchorRevision} />
        )}

      </div>

      {/* The way between panes on a phone; never rendered on a wide screen. */}
      <nav className="flex shrink-0 items-stretch border-t border-border-subtle bg-surface-raised lg:hidden">
        {MOBILE_PANES.map((entry) => {
          const active = mobilePane === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setMobilePane(entry.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
                active
                  ? "text-brand-strong"
                  : "text-text-muted hover:text-foreground active:bg-surface-sunken",
              )}
            >
              <entry.icon className="h-5 w-5" />
              {entry.label}
            </button>
          );
        })}
      </nav>

      <PassageToolbar />
      <LiquidTextModals />
      <PresenterShareDialog matter={shareTarget} onClose={() => setSharingOpen(false)} />
    </div>
  );
}

/**
 * The feature's root, and the only thing it exports.
 *
 * The boundary lives here rather than in the route so every consumer gets it
 * without having to know it exists — and so the feature's public surface
 * stays the single view the barrel promises.
 */
export function LiquidTextView() {
  return (
    <LiquidTextErrorBoundary>
      <LiquidTextWorkspace />
    </LiquidTextErrorBoundary>
  );
}
