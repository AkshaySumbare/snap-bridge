import { apiFetch } from "@/lib/api-client";
import { ApiError } from "@/lib/api-client";
import type {
  AskResponse,
  AskStreamEvent,
  SemanticSearchResult,
  SignedUploadParams,
  VaultDocument,
  VaultFolder,
} from "../types/vault.types";

interface CloudinaryUploadResponse {
  public_id: string;
  secure_url: string;
  format?: string;
  bytes: number;
  resource_type: string;
  error?: { message: string };
}

export type VaultUploadPhase = "signing" | "uploading" | "confirming";

export interface VaultUploadCallbacks {
  onPhaseChange?: (phase: VaultUploadPhase) => void;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new ApiError(0, "Upload cancelled");
  }
}

function uploadToCloudinary(
  uploadUrl: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<CloudinaryUploadResponse> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError(0, "Upload cancelled"));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);

    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort);

    const cleanup = () => signal?.removeEventListener("abort", onAbort);

    xhr.upload.onprogress = (event) => {
      if (!onProgress) return;
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      } else if (event.loaded > 0) {
        onProgress(0);
      }
    };

    xhr.onload = () => {
      cleanup();
      try {
        const data = JSON.parse(xhr.responseText) as CloudinaryUploadResponse;
        if (xhr.status >= 200 && xhr.status < 300 && !data.error) {
          onProgress?.(100);
          resolve(data);
          return;
        }
        reject(
          new ApiError(
            xhr.status,
            data.error?.message ?? "Failed to upload to Cloudinary",
          ),
        );
      } catch {
        reject(new ApiError(xhr.status, "Invalid response from Cloudinary"));
      }
    };

    xhr.onerror = () => {
      cleanup();
      reject(new ApiError(0, "Network error during upload"));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new ApiError(0, "Upload cancelled"));
    };
    xhr.send(formData);
  });
}

function deriveFormat(fileName: string, mimeType: string, cloudinaryFormat?: string): string {
  if (cloudinaryFormat?.trim()) return cloudinaryFormat.trim().toLowerCase();
  const ext = fileName.includes(".") ? fileName.split(".").pop() : undefined;
  if (ext) return ext.toLowerCase();
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.includes("wordprocessingml")) return "docx";
  if (mimeType.startsWith("image/")) return mimeType.split("/")[1] ?? "img";
  return "bin";
}

export const vaultApi = {
  getFolders: () =>
    apiFetch<{ folders: VaultFolder[] }>("/vault/folders").then((r) => r.folders),

  createFolder: (name: string) =>
    apiFetch<{ folder: VaultFolder }>("/vault/folders", {
      method: "POST",
      body: JSON.stringify({ name }),
    }).then((r) => r.folder),

  deleteFolder: (id: string) =>
    apiFetch<{ message: string }>(`/vault/folders/${id}`, { method: "DELETE" }),

  getUploadSign: (mimeType: string, fileName?: string) =>
    apiFetch<SignedUploadParams>("/vault/upload/sign", {
      method: "POST",
      body: JSON.stringify({ mimeType, fileName }),
    }),

  confirmUpload: (data: {
    publicId: string;
    secureUrl: string;
    mimeType: string;
    format: string;
    bytes: number;
    resourceType: "image" | "raw" | "video" | "auto";
    title?: string;
    folderId?: string;
  }) =>
    apiFetch<{ document: VaultDocument; message: string }>("/vault/upload/confirm", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  async uploadFile(file: File, folderId?: string, callbacks?: VaultUploadCallbacks) {
    const signal = callbacks?.signal;
    throwIfAborted(signal);

    callbacks?.onPhaseChange?.("signing");
    callbacks?.onProgress?.(0);

    const sign = await vaultApi.getUploadSign(file.type, file.name);
    throwIfAborted(signal);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("api_key", sign.apiKey);
    formData.append("timestamp", String(sign.timestamp));
    formData.append("signature", sign.signature);
    formData.append("folder", sign.folder);
    formData.append("public_id", sign.publicId);
    formData.append("overwrite", sign.overwrite);

    callbacks?.onPhaseChange?.("uploading");
    const uploadData = await uploadToCloudinary(
      sign.uploadUrl,
      formData,
      callbacks?.onProgress,
      signal,
    );
    throwIfAborted(signal);

    callbacks?.onPhaseChange?.("confirming");

    const result = await vaultApi.confirmUpload({
      publicId: uploadData.public_id,
      secureUrl: uploadData.secure_url,
      mimeType: file.type,
      format: deriveFormat(file.name, file.type, uploadData.format),
      bytes: uploadData.bytes,
      resourceType: sign.resourceType,
      title: file.name.replace(/\.[^.]+$/, ""),
      folderId,
    });
    throwIfAborted(signal);
    return result;
  },

  listDocuments: (params?: {
    folderId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) => {
    const search = new URLSearchParams();
    if (params?.folderId) search.set("folderId", params.folderId);
    if (params?.status) search.set("status", params.status);
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.offset) search.set("offset", String(params.offset));
    const qs = search.toString();
    return apiFetch<{
      documents: VaultDocument[];
      total: number;
      limit: number;
      offset: number;
    }>(`/vault/documents${qs ? `?${qs}` : ""}`);
  },

  getDocument: (id: string) =>
    apiFetch<{ document: VaultDocument }>(`/vault/documents/${id}`).then((r) => r.document),

  moveDocument: (id: string, folderId: string) =>
    apiFetch<{ document: VaultDocument }>(`/vault/documents/${id}/move`, {
      method: "PATCH",
      body: JSON.stringify({ folderId }),
    }).then((r) => r.document),

  deleteDocument: (id: string) =>
    apiFetch<{ message: string }>(`/vault/documents/${id}`, { method: "DELETE" }),

  retryDocument: (id: string) =>
    apiFetch<{ document: VaultDocument; message: string }>(`/vault/documents/${id}/retry`, {
      method: "POST",
    }),

  retryAllFailed: () =>
    apiFetch<{
      retried: string[];
      errors: { documentId: string; error: string }[];
      total: number;
      message: string;
    }>("/vault/documents/retry-failed", { method: "POST" }),

  ask: (data: {
    query: string;
    folderId?: string;
    documentId?: string;
    limit?: number;
    generateAnswer?: boolean;
  }) =>
    apiFetch<AskResponse>("/vault/ask", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  async askStream(
    data: {
      query: string;
      folderId?: string;
      documentId?: string;
      limit?: number;
      generateAnswer?: boolean;
    },
    callbacks: {
      onSources?: (results: SemanticSearchResult[], query: string) => void;
      onDelta?: (content: string) => void;
      onDone?: (answer: string | null) => void;
      onError?: (message: string) => void;
    },
    signal?: AbortSignal,
  ) {
    const res = await fetch("/api/vault/ask/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
      signal,
    });

    if (!res.ok) {
      let message = "Request failed";
      try {
        const body = (await res.json()) as { error?: unknown };
        if (typeof body.error === "string") message = body.error;
      } catch {
        message = res.statusText || message;
      }
      throw new ApiError(res.status, message);
    }

    if (!res.body) {
      throw new ApiError(500, "Streaming response is not supported");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const handleEvent = (event: AskStreamEvent) => {
      switch (event.type) {
        case "sources":
          callbacks.onSources?.(event.results, event.query);
          break;
        case "delta":
          callbacks.onDelta?.(event.content);
          break;
        case "done":
          callbacks.onDone?.(event.answer);
          break;
        case "error":
          callbacks.onError?.(event.message);
          break;
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const line = block
          .split("\n")
          .find((entry) => entry.startsWith("data: "));
        if (!line) continue;

        try {
          handleEvent(JSON.parse(line.slice(6)) as AskStreamEvent);
        } catch {
          // Ignore malformed SSE chunks
        }
      }
    }

    if (buffer.trim()) {
      const line = buffer
        .split("\n")
        .find((entry) => entry.startsWith("data: "));
      if (line) {
        try {
          handleEvent(JSON.parse(line.slice(6)) as AskStreamEvent);
        } catch {
          // Ignore malformed SSE chunks
        }
      }
    }
  },

  getAiConfig: () => apiFetch<{ active: Record<string, unknown>; note: string }>("/vault/ai-config"),
};
