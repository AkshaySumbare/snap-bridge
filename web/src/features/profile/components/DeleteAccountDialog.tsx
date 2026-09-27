import { useEffect, useState } from "react";

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
import { ApiError } from "@/lib/api-client";

const PHRASE = "delete";

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  requiresPassword: boolean;
  pending?: boolean;
  error?: unknown;
  onConfirm: (password?: string) => void;
}

export function DeleteAccountDialog({
  open,
  onOpenChange,
  email,
  requiresPassword,
  pending = false,
  error,
  onConfirm,
}: DeleteAccountDialogProps) {
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (open) {
      setTyped("");
      setPassword("");
    }
  }, [open]);

  const armed = typed.trim().toLowerCase() === PHRASE;
  const passwordOk = !requiresPassword || password.length > 0;
  const canSubmit = armed && passwordOk && !pending;

  const errorMessage =
    error instanceof ApiError ? error.message : error ? "Could not delete your account." : null;

  function confirm() {
    if (!canSubmit) return;
    onConfirm(requiresPassword ? password : undefined);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete account permanently?</DialogTitle>
          <DialogDescription>
            This removes <strong>{email}</strong> and everything tied to it: Knowledge Vault
            documents, Presenter workspaces you own, annotations, and shared access. This cannot be
            undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {requiresPassword && (
            <div className="space-y-1.5">
              <label htmlFor="delete-account-password" className="block text-xs text-text-secondary">
                Current password
              </label>
              <Input
                id="delete-account-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="delete-account-phrase" className="block text-xs text-text-secondary">
              Type <span className="font-semibold text-foreground">{PHRASE}</span> to confirm.
            </label>
            <Input
              id="delete-account-phrase"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={PHRASE}
              autoComplete="off"
              onKeyDown={(event) => {
                if (event.key === "Enter") confirm();
              }}
            />
          </div>

          {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={!canSubmit} onClick={confirm}>
            {pending ? "Deleting…" : "Delete my account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
