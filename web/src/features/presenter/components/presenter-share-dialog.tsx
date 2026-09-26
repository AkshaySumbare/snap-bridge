/**
 * Who else may open this case.
 *
 * Access is a flat grant — a colleague either sees the case or does not, with
 * no viewer/editor split, because a case is a shared workspace and a reader
 * who can open it can annotate it. Upstream scopes every case query to the
 * requester's firm, so the directory here is the whole population that can
 * ever be granted: someone outside the firm cannot be let in.
 *
 * One list, not two. A firm runs to dozens of people and a split of
 * "with access" above "available" makes the reader hunt in two places to
 * answer one question. A ticked row means in, an empty one means out, and
 * ticking is the whole interaction — no separate save step to forget.
 */

import { Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useFirmUsers, type FirmUser } from "@/features/rbac-admin";
import { useAuthUserStore } from "@/stores";
import { cn } from "@/lib/utils";

import { usePresenterCollaborators, useSharePresenter, useUnsharePresenter } from "../api/use-presenter";
import { inviteCollaborator } from "../api/presenter-api";
import { useQueryClient } from "@tanstack/react-query";
import { presenterKeys } from "../api/keys";

function displayName(user: FirmUser): string {
  const full = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return user.displayName?.trim() || user.name?.trim() || full || user.email || "Unnamed user";
}

interface Row {
  id: string;
  label: string;
  email: string;
  /** Holds access but is no longer in the directory — listed, never hidden. */
  departed: boolean;
}

interface PresenterShareDialogProps {
  /** The case being shared, or null when the dialog is closed. */
  matter: { id: string; name: string; sharedWith: string[] } | null;
  onClose: () => void;
}

export function PresenterShareDialog({ matter, onClose }: PresenterShareDialogProps) {
  const open = Boolean(matter);
  const directory = useFirmUsers(open);
  const collaborators = usePresenterCollaborators(matter?.id ?? null, open);
  const grant = useSharePresenter();
  const revoke = useUnsharePresenter();
  const queryClient = useQueryClient();
  const currentUserId = useAuthUserStore((state) => state.user?.id ?? null);

  const [query, setQuery] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  /**
   * Who should have access, as the reader has left it.
   *
   * Held locally rather than read from the server on every render: a tick has
   * to land instantly, and the request it triggers must carry what the reader
   * means *now*. Seeded when a case opens, and re-seeded from the server only
   * if a call fails.
   */
  const [selected, setSelected] = useState<string[]>([]);
  /** Rows with a call in flight, so each can show its own spinner. */
  const [inFlight, setInFlight] = useState<string[]>([]);

  /*
    Seeded once per case, not on every change to the server's answer. A grant
    settles, the case list refetches, and a new `sharedWith` arrives — if that
    re-seeded, it would untick a row the reader had just ticked whose own
    request is still queued behind it.
  */
  const serverShared = useRef<string[]>([]);
  serverShared.current = matter?.sharedWith ?? [];
  useEffect(() => {
    setSelected(serverShared.current);
    setQuery("");
    setInviteEmail("");
  }, [matter?.id]);

  // Authoritative per-presenter list from the server (each presenter has its own sharedWith).
  useEffect(() => {
    if (!collaborators.data || inFlight.length > 0) return;
    setSelected(collaborators.data.members.map((member) => member.id));
  }, [collaborators.data, collaborators.dataUpdatedAt, inFlight.length]);

  /*
    Grants are serialised.

    Upstream replaces the list wholesale, so two grants in flight at once race:
    the slower one lands last and evicts whoever the faster one added. Chaining
    them means every request is built and sent after the previous has settled.
  */
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const users = useMemo(() => directory.data ?? [], [directory.data]);

  const rows = useMemo<Row[]>(() => {
    const known = new Set(users.map((user) => user.id));
    const fromDirectory = users
      // The owner is in by owning it; upstream drops them from any list it is
      // given, so a tick against their own name could never stay ticked.
      .filter((user) => user.id !== currentUserId)
      .map((user) => ({
        id: user.id,
        label: displayName(user),
        email: user.email ?? "",
        departed: false,
      }));
    const departed = selected
      .filter((id) => !known.has(id) && id !== currentUserId)
      .map((id) => ({ id, label: "Former teammate", email: "", departed: true }));
    return [...departed, ...fromDirectory];
  }, [users, selected, currentUserId]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return rows;
    return rows.filter(
      (row) => row.label.toLowerCase().includes(needle) || row.email.toLowerCase().includes(needle),
    );
  }, [rows, query]);

  async function toggle(row: Row) {
    if (!matter || inFlight.includes(row.id)) return;

    const adding = !selected.includes(row.id);
    const next = adding ? [...selected, row.id] : selected.filter((id) => id !== row.id);

    // Optimistic: the tick is the reader's instruction, not the server's reply.
    setSelected(next);
    setInFlight((current) => [...current, row.id]);

    const run = queue.current.then(async () => {
      try {
        if (adding) {
          await grant.mutateAsync({ presenterId: matter.id, userIds: next });
        } else {
          await revoke.mutateAsync({ presenterId: matter.id, userId: row.id });
        }
      } catch {
        // Put the row back where the server still has it, so the list never
        // claims access that was not actually granted.
        setSelected((current) =>
          adding ? current.filter((id) => id !== row.id) : [...current, row.id],
        );
        toast.error(
          adding ? `Could not give ${row.label} access.` : `Could not remove ${row.label}.`,
        );
      } finally {
        setInFlight((current) => current.filter((id) => id !== row.id));
      }
    });

    queue.current = run;
    await run;
  }

  const count = selected.length;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share presenter</DialogTitle>
          <DialogDescription>
            {matter
              ? `Choose who can open “${matter.name}”. They will see its documents and annotations.`
              : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search people…"
              className="pl-9"
            />
          </div>

          <form
            className="flex gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!matter || !inviteEmail.trim()) return;
              setInviting(true);
              try {
                await inviteCollaborator(matter.id, inviteEmail.trim());
                await queryClient.invalidateQueries({
                  queryKey: presenterKeys.collaborators(matter.id),
                });
                toast.success(`Invite sent to ${inviteEmail.trim()}`);
                setInviteEmail("");
              } catch {
                toast.error("Could not send invite.");
              } finally {
                setInviting(false);
              }
            }}
          >
            <Input
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="Invite by email…"
              type="email"
            />
            <Button type="submit" size="sm" disabled={inviting || !inviteEmail.trim()}>
              Invite
            </Button>
          </form>

          {collaborators.data && collaborators.data.invites.length > 0 && (
            <div className="rounded-lg border border-border-subtle bg-surface-sunken/50 px-3 py-2">
              <p className="text-xs font-medium text-foreground">Pending invites (this presenter only)</p>
              <ul className="mt-1.5 space-y-1">
                {collaborators.data.invites.map((invite) => (
                  <li key={invite.id} className="truncate text-xs text-text-muted">
                    {invite.email}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/*
            The list scrolls inside the dialog rather than growing it. A firm of
            forty would otherwise push the footer off-screen, taking the way out
            with it.
          */}
          <div className="max-h-[46vh] overflow-y-auto rounded-lg border border-border-subtle">
            {visible.length === 0 ? (
              <p className="p-4 text-sm text-text-muted">
                {directory.isPending
                  ? "Loading your firm…"
                  : directory.isError
                    ? "Could not load your firm directory."
                    : "No one matches that search."}
              </p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {visible.map((row) => {
                  const checked = selected.includes(row.id);
                  const busy = inFlight.includes(row.id);
                  return (
                    <li key={row.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-3 p-2.5 transition-colors hover:bg-surface-sunken/60",
                          busy && "cursor-wait opacity-60",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={busy}
                          onCheckedChange={() => void toggle(row)}
                          aria-label={`${checked ? "Remove" : "Give"} ${row.label} access`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-foreground">
                            {row.label}
                          </span>
                          {row.email ? (
                            <span className="block truncate text-xs text-text-muted">
                              {row.email}
                            </span>
                          ) : null}
                        </span>
                        {busy ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-muted" />
                        ) : row.departed ? (
                          <span className="shrink-0 text-xs text-text-muted">
                            no longer in firm
                          </span>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter className="sm:items-center sm:justify-between">
          <span className="text-xs text-text-muted">
            {count === 0
              ? "Only you have access to this presenter"
              : `${count} colleague${count === 1 ? "" : "s"} can open this presenter`}
          </span>
          <Button type="button" variant="outline" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
