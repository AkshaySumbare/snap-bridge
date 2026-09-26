/**
 * Every dialog the workspace opens, driven by the single `modal` slot in the
 * UI store — one component so the open/close plumbing exists in one place.
 */

import { FileText, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";

import { useDeleteDocument, useUpdateDocument, useUploadDocument } from "../api/use-presenter";
import { mapDocument } from "../api/mappers";
import { useLiquidTextStore } from "../stores/liquid-text-store";
import { useLiquidTextUiStore } from "../stores/liquid-text-ui-store";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";

export function LiquidTextModals() {
  const modal = useLiquidTextUiStore((state) => state.modal);
  const closeModal = useLiquidTextUiStore((state) => state.closeModal);
  const clearCardSelection = useLiquidTextUiStore((state) => state.clearCardSelection);

  const documents = useLiquidTextStore((state) => state.project.documents);
  const renameDocument = useLiquidTextStore((state) => state.renameDocument);
  const deleteDocument = useLiquidTextStore((state) => state.deleteDocument);
  const presenterId = useLiquidTextStore((state) => state.project.id);
  const uploadDocument = useUploadDocument(presenterId);
  const updateDocument = useUpdateDocument(presenterId);
  const removeDocument = useDeleteDocument(presenterId);
  const addDocument = useLiquidTextStore((state) => state.addDocument);
  const deleteCard = useLiquidTextStore((state) => state.deleteCard);
  const deleteWrapper = useLiquidTextStore((state) => state.deleteWrapper);
  const removeCardLink = useLiquidTextStore((state) => state.removeCardLink);
  const activeWorkspace = useLiquidTextStore((state) =>
    state.project.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId),
  );

  const [value, setValue] = useState("");
  /** The PDF the reader picked, kept only to name the document it stands for. */
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const targetDocument =
    modal && "documentId" in modal
      ? (documents.find((document) => document.id === modal.documentId) ?? null)
      : null;

  // Seed the field whenever a dialog opens, so it always reflects live data.
  useEffect(() => {
    if (!modal) return;
    if (modal.kind === "renameDocument") {
      setValue(targetDocument?.title ?? "");
      return;
    }
    setValue("");
    setPickedFile(null);
    // targetDocument is derived from `modal`; depending on it too would reset
    // the field on every keystroke that changes the project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal]);

  if (!modal) return null;

  const close = () => closeModal();

  /**
   * Upload the chosen PDF.
   *
   * The rail shows the document as soon as the row exists and switches out of
   * "Parsing…" when extraction finishes — there is nothing local to fall back
   * on, so a failure leaves the dialog open rather than pretending.
   */
  async function addOrUpload() {
    const title = value.trim();
    if (title.length === 0) return;

    if (!pickedFile) {
      toast.error("Choose a PDF to upload.");
      return;
    }

    try {
      const created = await uploadDocument.mutateAsync({ file: pickedFile });
      /*
        On screen immediately, rather than whenever the next sync pull
        happens to notice it. It arrives with its parse still pending, so the
        rail shows it being read and the reader can watch it arrive instead
        of wondering whether the upload worked.
      */
      addDocument(mapDocument(created));
      toast.success(`“${pickedFile.name}” uploaded — reading it now`);
      close();
    } catch {
      // The dialog stays open with the file still chosen: making someone pick
      // the same PDF again because the network blinked is a poor apology.
      toast.error("Upload failed. Try again.");
    }
  }

  switch (modal.kind) {
    case "renameDocument":
      return (
        <Dialog open onOpenChange={(next) => { if (!next) close(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Rename document</DialogTitle>
              <DialogDescription>
                The name shows in the documents rail and in every citation on the canvas.
              </DialogDescription>
            </DialogHeader>
            <Input value={value} onChange={(event) => setValue(event.target.value)} autoFocus />
            <DialogFooter>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button
                disabled={value.trim().length === 0 || updateDocument.isPending}
                onClick={() => {
                  const title = value.trim();
                  if (title.length === 0) return;
                  // Renamed locally first so the rail responds to the click,
                  // and put back if the server disagrees.
                  const previous = targetDocument?.title;
                  renameDocument(modal.documentId, title);
                  close();
                  updateDocument
                    .mutateAsync({ documentId: modal.documentId, patch: { title } })
                    .catch(() => {
                      if (previous) renameDocument(modal.documentId, previous);
                      toast.error("Could not rename the document.");
                    });
                }}
              >
                {updateDocument.isPending ? "Renaming…" : "Rename"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );

    case "deleteDocument":
      return (
        <ConfirmDeleteDialog
          open
          onOpenChange={close}
          title={`Delete “${targetDocument?.title}”?`}
          description="It leaves this case for good — there is no undo. Its highlights and the excerpts quoted from it go with it. Your own notes stay, minus the passages that pointed into it."
          confirmLabel="Delete document"
          pending={removeDocument.isPending}
          onConfirm={() => {
            const documentId = modal.documentId;
            deleteDocument(documentId);
            close();
            removeDocument.mutateAsync(documentId).catch(() => {
              toast.error("Could not delete the document.");
            });
          }}
        />
      );

    case "addDocument":
      return (
        <Dialog open onOpenChange={(next) => { if (!next) close(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add document</DialogTitle>
              <DialogDescription>
                Choose a PDF from your computer. It is uploaded to this case and parsed so you can
                highlight and excerpt against its text.
              </DialogDescription>
            </DialogHeader>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (!file) return;
                setPickedFile(file);
                // The file name is the obvious title; the reader can still
                // edit it before adding, and rename it afterwards.
                setValue(file.name.replace(/\.pdf$/i, ""));
                // Reset, so picking the same file twice still fires a change.
                event.target.value = "";
              }}
            />

            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {pickedFile ? "Choose a different PDF" : "Choose PDF from your computer"}
              </Button>

              {pickedFile && (
                <p className="flex items-center gap-1.5 text-xs text-text-muted">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 truncate">{pickedFile.name}</span>
                  <span className="shrink-0">
                    · {Math.max(1, Math.round(pickedFile.size / 1024))} KB
                  </span>
                </p>
              )}

              <Input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="Document name"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button
                disabled={value.trim().length === 0 || !pickedFile || uploadDocument.isPending}
                onClick={() => void addOrUpload()}
              >
                {uploadDocument.isPending ? "Uploading…" : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );

    case "deleteCard": {
      // The same card type reaches this dialog from two places, and they are
      // not the same thing to the reader: a comment docked in the reader's
      // gutter, or an argument on the canvas.
      const card = activeWorkspace?.cards.find((entry) => entry.id === modal.cardId);
      const isComment = card?.placement === "margin";

      return (
        <ConfirmDeleteDialog
          open
          onOpenChange={close}
          title={isComment ? "Delete this comment?" : "Delete this argument?"}
          description={
            isComment
              ? "The highlight it was written against stays in the document — only the comment goes."
              : "Its references and the passages they point at go with it. The highlights stay in the document — only the argument goes."
          }
          confirmLabel={isComment ? "Delete comment" : "Delete argument"}
          onConfirm={() => {
            deleteCard(modal.cardId);
            clearCardSelection();
            close();
          }}
        />
      );
    }

    case "deleteWrapper": {
      const wrapper = activeWorkspace?.wrappers.find((entry) => entry.id === modal.wrapperId);
      const held =
        activeWorkspace?.cards.filter((card) => card.wrapperId === modal.wrapperId).length ?? 0;

      return (
        <ConfirmDeleteDialog
          open
          onOpenChange={close}
          title={`Delete “${wrapper?.title ?? "this point"}”?`}
          /*
            A Point takes its arguments with it, so the count is named rather
            than left for the reader to discover once it is gone.
          */
          description={`The point and the ${held} argument(s) filed under it go, along with their references and the passages those point at. The highlights stay in the document.`}
          confirmLabel="Delete point"
          onConfirm={() => {
            deleteWrapper(modal.wrapperId);
            close();
            toast.success("Point deleted, along with its arguments");
          }}
        />
      );
    }

    case "deleteLink": {
      const card = activeWorkspace?.cards.find((entry) => entry.id === modal.cardId);
      const link =
        card?.kind === "note" ? card.links.find((entry) => entry.id === modal.linkId) : undefined;

      return (
        <ConfirmDeleteDialog
          open
          onOpenChange={close}
          title={`Remove “${link?.label ?? "this reference"}”?`}
          description="The reference goes, and with it the passage it points at and any documents attached to it. The argument itself stays."
          confirmLabel="Remove reference"
          onConfirm={() => {
            removeCardLink(modal.cardId, modal.linkId);
            close();
          }}
        />
      );
    }

    default:
      return null;
  }
}
