export type DocumentStatus = "processing" | "ready" | "failed";

export interface VaultFolder {
  id: string;
  name: string;
  slug: string;
  type: "system" | "custom";
  smartCategory: string | null;
  parentId: string | null;
  color: string | null;
  createdAt: string;
}

export interface VaultDocument {
  id: string;
  title: string;
  mimeType: string;
  sourceType: string;
  folderId: string | null;
  secureUrl: string;
  format: string;
  bytes: number;
  status: DocumentStatus;
  chunkCount: number;
  processingError: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SignedUploadParams {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  publicId: string;
  overwrite: string;
  uploadUrl: string;
  mimeType: string;
  resourceType: "image" | "raw" | "video" | "auto";
  maxBytes: number;
}

export interface SemanticSearchResult {
  documentId: string;
  documentTitle: string;
  chunkText: string;
  chunkIndex: number;
  pageNumber: number | null;
  score: number;
  secureUrl: string;
  sourceType: string;
}

export interface AskResponse {
  query: string;
  results: SemanticSearchResult[];
  answer: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SemanticSearchResult[];
  timestamp: Date;
}

export const VAULT_ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
