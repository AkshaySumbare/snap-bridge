import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vaultApi } from "../api/vault.api";

export function useFolders() {
  return useQuery({
    queryKey: ["vault", "folders"],
    queryFn: vaultApi.getFolders,
  });
}

export function useDocuments(params?: {
  folderId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ["vault", "documents", params],
    queryFn: () => vaultApi.listDocuments(params),
    refetchInterval: (query) => {
      const docs = query.state.data?.documents;
      const hasProcessing = docs?.some((d) => d.status === "processing");
      return hasProcessing ? 3000 : false;
    },
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: ["vault", "document", id],
    queryFn: () => vaultApi.getDocument(id),
    enabled: Boolean(id),
    refetchInterval: (query) =>
      query.state.data?.status === "processing" ? 3000 : false,
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, folderId }: { file: File; folderId?: string }) =>
      vaultApi.uploadFile(file, folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault", "documents"] });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: vaultApi.deleteDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault", "documents"] });
    },
  });
}

export function useRetryDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: vaultApi.retryDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault", "documents"] });
    },
  });
}

export function useRetryAllFailed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: vaultApi.retryAllFailed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault", "documents"] });
    },
  });
}

export function useMoveDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string }) =>
      vaultApi.moveDocument(id, folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault", "documents"] });
    },
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: vaultApi.createFolder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault", "folders"] });
    },
  });
}

export function useAskVault() {
  return useMutation({
    mutationFn: vaultApi.ask,
  });
}
