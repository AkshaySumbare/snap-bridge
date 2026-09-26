/**
 * Type-to-confirm delete.
 *
 * Everything destructive in Presenter comes through here, so the gesture is
 * the same wherever the reader meets it: read what goes, type the word, then
 * the button turns on.
 *
 * The typing is the point. A Point, a PDF or a case can carry hours of
 * reading behind it, and the arguments built on it go too — a stray click on
 * a small icon should not be enough to spend that.
 */

import { useEffect, useState, type ReactNode } from "react";

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

/**
 * One word everywhere, rather than each dialog asking for the name of the
 * thing it is about. Names here are often long ("Share Purchase Agreement —
 * Vertex Infra") or empty, and a confirmation nobody can complete without
 * copy-and-paste stops being a confirmation.
 */
const PHRASE = "delete";

interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** What goes with it. Say it plainly — this is the reader's last look. */
  description: ReactNode;
  /** The armed button's label: "Delete point", "Delete case". */
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending = false,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  const [typed, setTyped] = useState("");

  // Cleared on every open, so a dialog never comes up already armed from the
  // last thing the reader deleted.
  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  // Trimmed and case-insensitive: the deliberation is in having to type the
  // word at all, not in matching it character for character.
  const armed = typed.trim().toLowerCase() === PHRASE;

  function confirm() {
    if (!armed || pending) return;
    onConfirm();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <label htmlFor="confirm-delete-phrase" className="block text-xs text-text-secondary">
            Type <span className="font-semibold text-foreground">{PHRASE}</span> to confirm.
          </label>
          <Input
            id="confirm-delete-phrase"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={PHRASE}
            autoFocus
            autoComplete="off"
            aria-label={`Type ${PHRASE} to confirm`}
            onKeyDown={(event) => {
              if (event.key === "Enter") confirm();
            }}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={!armed || pending} onClick={confirm}>
            {pending ? "Deleting…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
