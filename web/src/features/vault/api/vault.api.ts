import { apiFetch } from "@/lib/api-client";
import { ApiError } from "@/lib/api-client";
import type {
  AskResponse,
  SignedUploadParams,
  VaultDocument,
  VaultFolder,
} from "../types/vault.types";

interface CloudinaryUploadResponse {
  public_id: string;
  secure_url: string;
  format: string;
  bytes: number;
  resource_type: string;
  error?: { message: string };
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

  async uploadFile(file: File, folderId?: string) {
    const sign = await vaultApi.getUploadSign(file.type, file.name);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("api_key", sign.apiKey);
    formData.append("timestamp", String(sign.timestamp));
    formData.append("signature", sign.signature);
    formData.append("folder", sign.folder);
    formData.append("public_id", sign.publicId);
    formData.append("overwrite", sign.overwrite);

    const uploadRes = await fetch(sign.uploadUrl, { method: "POST", body: formData });
    const uploadData = (await uploadRes.json()) as CloudinaryUploadResponse;

    if (!uploadRes.ok || uploadData.error) {
      throw new ApiError(
        uploadRes.status,
        uploadData.error?.message ?? "Failed to upload to Cloudinary",
      );
    }

    return vaultApi.confirmUpload({
      publicId: uploadData.public_id,
      secureUrl: uploadData.secure_url,
      mimeType: file.type,
      format: uploadData.format,
      bytes: uploadData.bytes,
      resourceType: sign.resourceType,
      title: file.name.replace(/\.[^.]+$/, ""),
      folderId,
    });
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

  getAiConfig: () => apiFetch<{ active: Record<string, unknown>; note: string }>("/vault/ai-config"),
};
