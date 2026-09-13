import { useState } from "react";
import { ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageLoader } from "@/components/ui/Loader";
import { Alert } from "@/components/ui/Alert";
import {
  useDeleteDocument,
  useDocuments,
  useFolders,
  useRetryAllFailed,
  useRetryDocument,
} from "../hooks/useVault";
import { DocumentStatusBadge } from "../components/DocumentStatusBadge";
import { ApiError } from "@/lib/api-client";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VaultDocumentsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const { data: folders } = useFolders();
  const { data, isLoading } = useDocuments({
    status: statusFilter || undefined,
    folderId: folderFilter || undefined,
  });
  const retryOne = useRetryDocument();
  const retryAll = useRetryAllFailed();
  const deleteDoc = useDeleteDocument();

  const retryableCount =
    data?.documents.filter(
      (d) =>
        d.status === "failed" ||
        (d.status === "ready" && d.chunkCount === 0 && d.processingError),
    ).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Documents</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Processing status, chunks, and retry failed uploads.
          </p>
        </div>
        {retryableCount > 0 && (
          <Button
            variant="secondary"
            size="sm"
            loading={retryAll.isPending}
            onClick={() => retryAll.mutate()}
          >
            <RefreshCw className="h-4 w-4" />
            Retry all ({retryableCount})
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="processing">Processing</option>
          <option value="ready">Ready</option>
          <option value="failed">Failed</option>
        </select>
        <select
          value={folderFilter}
          onChange={(e) => setFolderFilter(e.target.value)}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        >
          <option value="">All folders</option>
          {folders?.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <PageLoader label="Loading documents..." />
      ) : !data?.documents.length ? (
        <Card>
          <p className="text-center text-sm text-[var(--color-text-muted)]">
            No documents yet. Upload your first file from the Upload tab.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.documents.map((doc) => (
            <Card key={doc.id} className="!p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-[var(--color-text)]">{doc.title}</h3>
                    <DocumentStatusBadge status={doc.status} />
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    {doc.mimeType} · {formatBytes(doc.bytes)} · {doc.chunkCount} chunks
                  </p>
                  {doc.processingError && (
                    <p className="mt-2 text-xs text-red-500">{doc.processingError}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <a
                    href={doc.secureUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  {(doc.status === "failed" ||
                    doc.processingError ||
                    (doc.status === "ready" && doc.chunkCount === 0)) && (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={retryOne.isPending}
                      onClick={() => retryOne.mutate(doc.id)}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={deleteDoc.isPending}
                    onClick={() => deleteDoc.mutate(doc.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {(retryOne.error || retryAll.error) && (
        <Alert variant="error">
          {retryOne.error instanceof ApiError
            ? retryOne.error.message
            : retryAll.error instanceof ApiError
              ? retryAll.error.message
              : "Retry failed"}
        </Alert>
      )}
    </div>
  );
}
