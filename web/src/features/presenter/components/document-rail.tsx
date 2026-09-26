/**
 * Left rail: the reading tools, then the document library.
 */

import {
  ArrowDownUp,
  ChevronLeft,
  FileText,
  Home,
  Users,
  LayoutGrid,
  ListFilter,
  Pencil,
  Rows3,
  Search,
  SquarePlus,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import { useLiquidTextStore } from "../stores/liquid-text-store";
import { ParseBadge, ParseRetry } from "./parse-indicator";
import { useLiquidTextUiStore } from "../stores/liquid-text-ui-store";

type SortMode = "name" | "recent";

function RailToolButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Rows3;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary/15 text-primary"
          : "text-text-secondary hover:bg-surface-sunken hover:text-foreground",
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

interface DocumentRailProps {
  /** Leaves the open project and returns to the library. */
  onExit: () => void;
  /** Opens share for this presenter only (owner). */
  onShare?: () => void;
  canShare?: boolean;
}

export function DocumentRail({ onExit, onShare, canShare = false }: DocumentRailProps) {
  const project = useLiquidTextStore((state) => state.project);
  const activeDocumentId = useLiquidTextStore((state) => state.activeDocumentId);
  const selectedDocumentIds = useLiquidTextStore((state) => state.selectedDocumentIds);
  const showOnlyDocument = useLiquidTextStore((state) => state.showOnlyDocument);
  const toggleDocumentSelected = useLiquidTextStore((state) => state.toggleDocumentSelected);

  const railCollapsed = useLiquidTextUiStore((state) => state.railCollapsed);
  const toggleRail = useLiquidTextUiStore((state) => state.toggleRail);
  const setMobilePane = useLiquidTextUiStore((state) => state.setMobilePane);
  const highlightViewOpen = useLiquidTextUiStore((state) => state.highlightViewOpen);
  const toggleHighlightView = useLiquidTextUiStore((state) => state.toggleHighlightView);

  /*
    HighlightView is opened from here but drawn inside the reader, so on a
    narrow screen the button would appear to do nothing at all — the pane it
    changes is not the one being looked at. Following it across is what makes
    the control mean the same thing on a phone as on a desktop, where the
    reader is simply beside the rail.
  */
  const openHighlightView = () => {
    toggleHighlightView();
    setMobilePane("reader");
  };
  const documentFilter = useLiquidTextUiStore((state) => state.documentFilter);
  const setDocumentFilter = useLiquidTextUiStore((state) => state.setDocumentFilter);
  const openModal = useLiquidTextUiStore((state) => state.openModal);
  const panel = useLiquidTextUiStore((state) => state.panel);
  const openPanel = useLiquidTextUiStore((state) => state.openPanel);
  const closePanel = useLiquidTextUiStore((state) => state.closePanel);

  const togglePanel = (id: "search") => {
    if (panel === id) {
      closePanel();
      return;
    }
    openPanel(id);
    setMobilePane("workspace");
  };

  const [sortMode, setSortMode] = useState<SortMode>("name");

  const visibleDocuments = useMemo(() => {
    const needle = documentFilter.trim().toLowerCase();
    const matching = project.documents.filter(
      (document) => needle.length === 0 || document.title.toLowerCase().includes(needle),
    );
    const sorted = [...matching].sort((a, b) =>
      sortMode === "name" ? a.title.localeCompare(b.title) : 0,
    );

    return sorted;
  }, [documentFilter, project.documents, sortMode]);

  if (railCollapsed) {
    return (
      <div className="flex w-full shrink-0 flex-col items-center gap-2 border-r border-border-subtle bg-surface-sunken py-3 lg:w-11">
        <button
          type="button"
          onClick={toggleRail}
          aria-label="Expand documents rail"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-raised hover:text-foreground"
        >
          <LayoutGrid className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={openHighlightView}
          aria-label="HighlightView"
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            highlightViewOpen
              ? "bg-primary/15 text-primary"
              : "text-text-secondary hover:bg-surface-raised hover:text-foreground",
          )}
        >
          <Rows3 className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden border-r border-border-subtle bg-surface-sunken lg:w-[248px]">
      {/*
        Three controls, shown rather than filed away.
        
        They used to sit inside a "Settings" dropdown, which is a poor name for
        leaving the case and searching it — neither is a setting, and both are
        reached often enough that a menu was a step in the way.
      */}
      <div className="flex items-center gap-1 px-2 pb-2 pt-3">
        <button
          type="button"
          onClick={onExit}
          aria-label="Back to library"
          title="Back to library"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface-raised hover:text-foreground"
        >
          <Home className="h-4 w-4" />
        </button>
        {canShare && onShare && (
          <button
            type="button"
            onClick={onShare}
            aria-label="Share this presenter"
            title="Share this presenter"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface-raised hover:text-foreground"
          >
            <Users className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => togglePanel("search")}
          aria-label="Search project"
          title="Search project"
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-surface-raised hover:text-foreground",
            panel === "search" ? "bg-primary/15 text-primary" : "text-text-secondary",
          )}
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={toggleRail}
          aria-label="Collapse documents rail"
          title="Collapse rail"
          className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-raised hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-0.5 px-2">
        <RailToolButton
          icon={Rows3}
          label="HighlightView"
          active={highlightViewOpen}
          onClick={openHighlightView}
        />
      </div>

      <>
        <button
          type="button"
          onClick={() => openModal({ kind: "addDocument" })}
          className="mx-2 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
        >
          <SquarePlus className="h-[18px] w-[18px]" />
          Add Document
        </button>

        <div className="mx-3 mb-2 mt-1 flex items-center gap-1.5">
          <div className="relative flex-1">
            <ListFilter className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <input
              value={documentFilter}
              onChange={(event) => setDocumentFilter(event.target.value)}
              placeholder="Filter Documents"
              className="w-full rounded-full bg-surface-raised py-1.5 pl-7 pr-2 text-xs text-foreground outline-none placeholder:text-input-placeholder focus:ring-1 focus:ring-ring"
            />
          </div>
          <button
            type="button"
            onClick={() => setSortMode((mode) => (mode === "name" ? "recent" : "name"))}
            title={sortMode === "name" ? "Sorted by name" : "Sorted by recently added"}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-raised hover:text-foreground"
          >
            <ArrowDownUp className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {visibleDocuments.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-text-muted">
              No documents match “{documentFilter}”.
            </p>
          )}
          {visibleDocuments.map((document) => {
            const isShown = selectedDocumentIds.includes(document.id);
            const isActive = document.id === activeDocumentId;
            const isOnlyShown = isShown && selectedDocumentIds.length === 1;
            return (
              <div
                key={document.id}
                className={cn(
                  "group mb-1 flex items-start gap-2 rounded-lg px-2.5 py-2 transition-colors",
                  isShown
                    ? "bg-surface-raised shadow-elevation-raised"
                    : "hover:bg-surface-raised/70",
                )}
              >
                {/*
                        The tick adds a document to the reader alongside the
                        others; clicking the row shows that one on its own.
                        Two gestures because both are wanted often, and
                        overloading one of them with a modifier key hides the
                        multi-select from anyone who does not know it is there.
                      */}
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                  <Checkbox
                    checked={isShown}
                    disabled={isOnlyShown}
                    onCheckedChange={() => toggleDocumentSelected(document.id)}
                    aria-label={
                      isShown
                        ? `Remove ${document.title} from the reader`
                        : `Also show ${document.title} in the reader`
                    }
                    className="h-3.5 w-3.5"
                  />
                </span>
                <button
                  type="button"
                  onClick={() => {
                    showOnlyDocument(document.id);
                    // On a phone the reader is a pane away, so picking a
                    // document has nothing visible to show for itself unless
                    // we follow it there. Inert on a wide screen, where the
                    // reader is already beside the rail.
                    setMobilePane("reader");
                  }}
                  title={`Show only ${document.title}`}
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                >
                  <FileText
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      isActive
                        ? "text-primary"
                        : isShown
                          ? "text-text-secondary"
                          : "text-text-muted",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium leading-snug text-foreground">
                      {document.title}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1">
                      <ParseBadge document={document} />
                      {!document.ocrComplete && (
                        <span className="rounded bg-status-warning-subtle px-1 py-px text-[10px] text-status-warning">
                          No OCR
                        </span>
                      )}
                    </span>
                  </span>
                </button>

                <ParseRetry document={document} />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Actions for ${document.title}`}
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted opacity-0 transition-opacity hover:bg-surface-sunken hover:text-foreground focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                    >
                      <span className="text-base leading-none">⋮</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuItem
                      onSelect={() =>
                        openModal({ kind: "renameDocument", documentId: document.id })
                      }
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        openModal({ kind: "deleteDocument", documentId: document.id })
                      }
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      </>
    </aside>
  );
}
