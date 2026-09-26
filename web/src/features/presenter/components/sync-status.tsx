/**
 * Whether the reader's work has reached the server.
 *
 * Presenter saves silently, which is right when it is working and dangerous
 * when it is not: a reader has no other way to tell. This used to be tracked
 * and never shown, so an expired session looked exactly like a healthy one —
 * points and highlights appearing on screen for an hour, none of it stored.
 *
 * Persistent rather than a toast. A toast for something still going wrong
 * disappears before it has been understood, and reappearing every fifteen
 * seconds is worse than either.
 *
 * Silent when idle. A save indicator that is always visible stops being read.
 */

import { AlertTriangle, Loader2, LogIn } from "lucide-react";

import { cn } from "@/lib/utils";

import type { PresenterSync } from "../api/use-presenter-sync";

const changes = (n: number) => `${n} change${n === 1 ? "" : "s"}`;

export function SyncStatus({ sync }: { sync: PresenterSync }) {
  if (sync.status === "idle") return null;

  const chip =
    "flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium leading-none";

  if (sync.status === "saving") {
    return (
      <span role="status" className={cn(chip, "text-text-muted")} title="Your work is being saved">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Saving…
      </span>
    );
  }

  /*
   * Refused rather than failed: retrying will go on being refused, so the
   * reader is told what to do instead of being reassured by a spinner.
   */
  if (sync.status === "blocked") {
    return (
      <span
        role="alert"
        className={cn(chip, "bg-destructive/10 text-destructive")}
        title={`${changes(sync.pending)} could not be saved. Your session has expired — sign in again in another tab, and this will save itself.`}
      >
        <LogIn className="h-3 w-3" aria-hidden />
        Not saved — sign in again
      </span>
    );
  }

  return (
    <span
      role="status"
      className={cn(chip, "bg-status-warning-subtle text-status-warning")}
      title={`${changes(sync.pending)} have not reached the server yet. This keeps retrying on its own — leave the tab open.`}
    >
      <AlertTriangle className="h-3 w-3" aria-hidden />
      Not saved — retrying
    </span>
  );
}
