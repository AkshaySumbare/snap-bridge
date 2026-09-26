/**
 * Typed BFF client for Presenter.
 *
 * Every function calls an internal `/api/presenter/*` route — never the
 * service directly — and validates the reply with a Zod schema at the client
 * boundary, so a shape that drifts fails here rather than halfway through a
 * render.
 */

import { api, apiFetch } from "@/lib/api/client";

import {
  WireBootstrapSchema,
  WireCollaboratorsSchema,
  WirePresenterListSchema,
  WirePresenterSchema,
  WireDocumentSchema,
  WireDownloadUrlsSchema,
  WirePagesResponseSchema,
  WireParseSchema,
  WireSyncResponseSchema,
  type WireBootstrap,
  type WireCollaborators,
  type WirePresenter,
  type WireDocument,
  type WireDownloadUrls,
  type WireParse,
  type WireSyncResponse,
} from "../schemas/presenter.schema";

const BASE = "/presenter";
const presenterBase = (presenterId: string) => `${BASE}/${encodeURIComponent(presenterId)}`;

export async function fetchPresenters(signal?: AbortSignal): Promise<WirePresenter[]> {
  return WirePresenterListSchema.parse(await api.get<unknown>(`${BASE}/list`, { signal }));
}

export async function createPresenter(input: { name: string; client?: string }): Promise<WirePresenter> {
  return WirePresenterSchema.parse(await api.post<unknown>(`${BASE}/create`, input));
}

export async function updatePresenter(
  presenterId: string,
  patch: { name?: string; client?: string; accent?: string },
): Promise<WirePresenter> {
  return WirePresenterSchema.parse(await api.patch<unknown>(presenterBase(presenterId), patch));
}

/**
 * Let colleagues into a case.
 *
 * Replaces the list wholesale rather than adding to it — send the ids that
 * should have access, not the one being added. The server drops the owner
 * from whatever it is given, since they are in by owning it.
 */
export async function sharePresenter(presenterId: string, userIds: string[]): Promise<WirePresenter> {
  return WirePresenterSchema.parse(await api.put<unknown>(`${presenterBase(presenterId)}/share`, { userIds }));
}

export async function unsharePresenter(presenterId: string, userId: string): Promise<WirePresenter> {
  return WirePresenterSchema.parse(
    await api.delete<unknown>(`${presenterBase(presenterId)}/share/${encodeURIComponent(userId)}`),
  );
}

export async function fetchCollaborators(
  presenterId: string,
  signal?: AbortSignal,
): Promise<WireCollaborators> {
  return WireCollaboratorsSchema.parse(
    await api.get<unknown>(`${presenterBase(presenterId)}/collaborators`, { signal }),
  );
}

export async function inviteCollaborator(presenterId: string, email: string) {
  return api.post<unknown>(`${presenterBase(presenterId)}/invites`, { email });
}

export async function acceptPresenterInvite(token: string) {
  return api.post<{ presenterId: string }>(`/presenter/invites/${encodeURIComponent(token)}/accept`);
}

/**
 * Permanent, and owner-only. Takes every PDF, page and annotation in the case
 * with it — there is no undo on the server side.
 */
export async function deletePresenter(presenterId: string): Promise<void> {
  await api.delete<unknown>(presenterBase(presenterId));
}

// ── opening a case ──────────────────────────────────────────────────────────

export async function fetchBootstrap(presenterId: string, signal?: AbortSignal): Promise<WireBootstrap> {
  return WireBootstrapSchema.parse(
    await api.get<unknown>(`${presenterBase(presenterId)}/bootstrap`, { signal }),
  );
}

// ── documents ───────────────────────────────────────────────────────────────

/**
 * Upload a PDF.
 *
 * Sent as multipart through the BFF, which streams the raw body upstream.
 * Returns as soon as the file is stored and the row exists — extraction runs
 * behind it, and the rail polls `parse-status` until it is ready.
 */
export async function uploadDocument(
  presenterId: string,
  file: File,
  folderId?: string | null,
): Promise<WireDocument> {
  const body = new FormData();
  body.append("file", file);
  if (folderId) body.append("folderId", folderId);
  return WireDocumentSchema.parse(
    await apiFetch<unknown>(`${presenterBase(presenterId)}/documents`, { method: "POST", body }),
  );
}

export async function updateDocument(
  presenterId: string,
  documentId: string,
  patch: { title?: string; folderId?: string | null; order?: number },
): Promise<WireDocument> {
  return WireDocumentSchema.parse(
    await api.patch<unknown>(
      `${presenterBase(presenterId)}/documents/${encodeURIComponent(documentId)}`,
      patch,
    ),
  );
}

/**
 * Removes the document from the case, along with its highlights, the excerpts
 * quoted from it, and any passage pointing into it. The rows stay in the
 * database behind `isDeleted`; there is no way back through the UI.
 */
export async function deleteDocument(presenterId: string, documentId: string): Promise<void> {
  await api.delete<unknown>(`${presenterBase(presenterId)}/documents/${encodeURIComponent(documentId)}`);
}

export async function fetchPages(
  presenterId: string,
  documentId: string,
  from: number,
  to: number,
  signal?: AbortSignal,
) {
  return WirePagesResponseSchema.parse(
    await api.get<unknown>(
      `${presenterBase(presenterId)}/documents/${encodeURIComponent(documentId)}/pages`,
      { signal, searchParams: { from, to } },
    ),
  );
}

export async function fetchParseStatus(
  presenterId: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<WireParse> {
  // Validated like every other response: `stalled` is derived server-side, and
  // a status this client does not know about must fail here rather than fall
  // through the rail's switch as "not ready" forever.
  return WireParseSchema.parse(
    await api.get<unknown>(
      `${presenterBase(presenterId)}/documents/${encodeURIComponent(documentId)}/parse-status`,
      { signal },
    ),
  );
}

/** Re-run an extraction that stalled or failed. Nothing retries on its own. */
export async function retryParse(presenterId: string, documentId: string): Promise<void> {
  await api.post<unknown>(`${presenterBase(presenterId)}/documents/${encodeURIComponent(documentId)}/parse`);
}

// ── sync ────────────────────────────────────────────────────────────────────

export interface SyncChanges {
  folders?: Record<string, unknown>[];
  wrappers?: Record<string, unknown>[];
  cards?: Record<string, unknown>[];
  links?: Record<string, unknown>[];
  connections?: Record<string, unknown>[];
  highlights?: Record<string, unknown>[];
}

/**
 * Push changes and pull what the rest of the world did, in one round trip.
 *
 * The only write path for annotation data. `since` is the cursor from the
 * previous sync (or bootstrap); omit it to be sent everything.
 */
export async function pushSync(
  presenterId: string,
  input: { since?: string | null; changes?: SyncChanges; deviceId?: string },
): Promise<WireSyncResponse> {
  return WireSyncResponseSchema.parse(
    await api.post<unknown>(`${presenterBase(presenterId)}/sync`, {
      since: input.since ?? null,
      deviceId: input.deviceId,
      changes: input.changes ?? {},
    }),
  );
}

// ── offline + search ────────────────────────────────────────────────────────

export async function fetchDownloadUrls(
  presenterId: string,
  documentIds?: string[],
  expiryMinutes?: number,
): Promise<WireDownloadUrls> {
  return WireDownloadUrlsSchema.parse(
    await api.get<unknown>(`${presenterBase(presenterId)}/download-urls`, {
      searchParams: {
        ...(documentIds?.length ? { documentIds: documentIds.join(",") } : {}),
        ...(expiryMinutes ? { expiryMinutes } : {}),
      },
    }),
  );
}
