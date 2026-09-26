/**
 * Landing screen: the reader's cases.
 *
 * The reader works a matter at a time, so the way in is a folder per case
 * rather than a flat list of documents. Opening one drops them into that
 * case's workspace, where its documents are read and its arguments built.
 *
 * The list, the counts and who each case is shared with are the server's
 * answer; there is no local fallback, so an empty list means the reader has
 * no cases rather than that something failed to load.
 */

import {
  Clock,
  FileText,
  FolderOpen,
  Highlighter,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/lib/sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { usePresenters, useDeletePresenter, useUpdatePresenter } from "../api/use-presenter";
import { PresenterShareDialog } from "./presenter-share-dialog";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import { HIGHLIGHT_STYLES } from "../constants";
import type { HighlightColor } from "../types";

/**
 * The tint, defended.
 *
 * The server types this as a string, because a tint is cosmetic and not
 * worth failing a whole case list over. An accent nobody recognises falls
 * back rather than throwing on an index.
 */
function accentStyle(accent: string) {
  return HIGHLIGHT_STYLES[accent as HighlightColor] ?? HIGHLIGHT_STYLES.blue;
}

function formatUpdated(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

interface PresenterHomeProps {
  onOpen: (presenterId: string) => void;
}

export function PresenterHome({ onOpen }: PresenterHomeProps) {
  const navigate = useNavigate();
  const remoteList = usePresenters();
  const renamePresenter = useUpdatePresenter();
  const deletePresenter = useDeletePresenter();

  const items = remoteList.data ?? [];
  const loading = remoteList.isPending;
  const loadFailed = remoteList.isError;

  const [name, setName] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);

  const deleteTarget = items.find((item) => item.id === deleting) ?? null;
  const shareTarget = items.find((item) => item.id === sharing) ?? null;

  function openRename(item: { id: string; name: string; client: string }) {
    setName(item.name);
    setSubtitle(item.client);
    setRenaming(item.id);
  }

  async function rename() {
    const trimmed = name.trim();
    if (!renaming || trimmed.length === 0) return;

    try {
      await renamePresenter.mutateAsync({
        presenterId: renaming,
        patch: { name: trimmed, client: subtitle.trim() },
      });
      setRenaming(null);
      toast.success("Presenter updated");
    } catch {
      toast.error("Could not update. Try again.");
    }
  }

  async function remove() {
    if (!deleting) return;
    const label = deleteTarget?.name ?? "This presenter";

    try {
      await deletePresenter.mutateAsync(deleting);
      setDeleting(null);
      toast.success(`“${label}” deleted`);
    } catch {
      toast.error("Could not delete. Try again.");
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-surface-base px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-foreground sm:text-2xl">Presenter</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            Open a presenter to read its documents and annotate beside them.
          </p>
        </header>

        {loadFailed && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Could not load your presenters.{" "}
            <button
              type="button"
              onClick={() => void remoteList.refetch()}
              className="font-medium underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !loadFailed && items.length === 0 && (
          <p className="mb-4 text-sm text-text-muted">
            Nothing here yet. Create a presenter and add the documents you want to read.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <button
            type="button"
            onClick={() => navigate("/presenter/create")}
            className="flex min-h-[168px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-default bg-surface-raised/50 text-text-muted transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="h-6 w-6" />
            <span className="text-sm font-medium">New presenter</span>
          </button>

          {loading &&
            [0, 1, 2].map((slot) => (
              <div
                key={slot}
                className="min-h-[168px] animate-pulse rounded-xl border border-border-subtle bg-surface-raised"
                aria-hidden
              />
            ))}

          {items.map((item) => (
            <div key={item.id} className="group relative">
              <button
                type="button"
                onClick={() => onOpen(item.id)}
                className="flex min-h-[168px] w-full flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-raised text-left shadow-elevation-raised transition-transform hover:-translate-y-0.5"
              >
                <span className={cn("h-1.5 w-full", accentStyle(item.accent).bar)} aria-hidden />
                <span className="flex flex-1 flex-col p-4">
                  <span className="flex items-start gap-2">
                    <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                    <span className="min-w-0 pr-6">
                      <span className="block text-sm font-semibold leading-snug text-foreground">
                        {item.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-text-muted">
                        {item.client}
                      </span>
                    </span>
                  </span>
                  <span className="mt-auto space-y-1.5 pt-4 text-xs text-text-muted">
                    <span className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      {item.documentCount} documents
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Highlighter className="h-3.5 w-3.5" />
                      {item.excerptCount} excerpts
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {formatUpdated(item.updatedAt)}
                    </span>
                    {!item.isOwner && (
                      <span className="flex items-center gap-1.5 text-brand-strong">
                        <Users className="h-3.5 w-3.5" />
                        Shared with you
                      </span>
                    )}
                    {item.isOwner && item.sharedWith.length > 0 && (
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        {item.sharedWith.length} with access
                      </span>
                    )}
                  </span>
                </span>
              </button>

              {/*
                Menu root must sit in an absolute corner of the card. The
                dropdown component wraps its trigger in `relative inline-flex`,
                which in normal flow would render as a second row under the
                card and park the ⋮ below the tile.
              */}
              <div className="pointer-events-none absolute right-2 top-4 z-10">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Actions for ${item.name}`}
                      className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded text-text-muted opacity-0 transition-opacity hover:bg-surface-sunken hover:text-foreground focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                    >
                      <span className="text-base leading-none">⋮</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onSelect={() => openRename(item)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Rename
                    </DropdownMenuItem>
                    {item.isOwner && (
                      <DropdownMenuItem onSelect={() => setSharing(item.id)}>
                        <Users className="mr-2 h-4 w-4" />
                        Share
                      </DropdownMenuItem>
                    )}
                    {item.isOwner && (
                      <DropdownMenuItem onSelect={() => setDeleting(item.id)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      </div>

      <PresenterShareDialog matter={shareTarget} onClose={() => setSharing(null)} />

      <Dialog open={Boolean(renaming)} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename presenter</DialogTitle>
            <DialogDescription>
              The name and subtitle show on this tile. Nothing inside the presenter moves.
            </DialogDescription>
          </DialogHeader>

          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter") void rename();
            }}
          />
          <Input
            value={subtitle}
            onChange={(event) => setSubtitle(event.target.value)}
            placeholder="Subtitle (optional)"
            onKeyDown={(event) => {
              if (event.key === "Enter") void rename();
            }}
          />

          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              disabled={name.trim().length === 0 || renamePresenter.isPending}
              onClick={() => void rename()}
            >
              {renamePresenter.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleteTarget?.name}”?`}
        /*
          Spelled out rather than softened. Unlike a document or a Point,
          which stay in the database behind an isDeleted flag, a case is
          erased: this is the answer to a client asking for their material to
          be removed, so it has to actually remove it.
        */
        description={`This deletes the presenter and everything in it — ${deleteTarget?.documentCount ?? 0} document(s), every page, and every annotation. The files leave storage. There is no undo.`}
        confirmLabel="Delete presenter"
        pending={deletePresenter.isPending}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
