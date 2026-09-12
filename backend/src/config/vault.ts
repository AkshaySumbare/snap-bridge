/** Vault upload + semantic search configuration */
export const VAULT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type VaultMimeType = (typeof VAULT_ALLOWED_MIME_TYPES)[number];

export const VAULT_SMART_CATEGORIES = [
  "Inbox",
  "Bills",
  "Work",
  "Study",
  "Career",
  "Legal",
  "Personal",
] as const;

export type SmartCategory = (typeof VAULT_SMART_CATEGORIES)[number];

export const DOCUMENT_QUEUE_NAME = "document-process";

export const VECTOR_INDEX_NAME = "chunk_embedding_index";
