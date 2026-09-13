import { useRef, useState } from "react";
import { FileText, FileUp, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Progress } from "@/components/ui/Progress";
import { useFolders, useUploadDocument } from "../hooks/useVault";
import { VAULT_ALLOWED_TYPES } from "../types/vault.types";
import type { VaultUploadPhase } from "../api/vault.api";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";

const PHASE_LABELS: Record<VaultUploadPhase, string> = {
  signing: "Preparing upload…",
  uploading: "Uploading to cloud…",
  confirming: "Saving to vault…",
};

function formatFileSize(bytes: number) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function VaultUploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [folderId, setFolderId] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileTypeError, setFileTypeError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<VaultUploadPhase | null>(null);
  const { data: folders } = useFolders();
  const upload = useUploadDocument();

  const isUploading = upload.isPending;
  const hasSelection = Boolean(selectedFile);
  const error =
    upload.error instanceof ApiError && upload.error.message === "Upload cancelled"
      ? null
      : upload.error instanceof ApiError
        ? upload.error.message
        : upload.error?.message;

  function resetInput() {
    if (inputRef.current) inputRef.current.value = "";
  }

  function resetUploadState() {
    setUploadProgress(0);
    setUploadPhase(null);
    abortRef.current = null;
  }

  function clearSelection() {
    abortRef.current?.abort();
    abortRef.current = null;
    setSelectedFile(null);
    setFileTypeError(null);
    resetUploadState();
    resetInput();
    upload.reset();
  }

  function selectFile(file: File) {
    if (!VAULT_ALLOWED_TYPES.includes(file.type as (typeof VAULT_ALLOWED_TYPES)[number])) {
      setFileTypeError("Unsupported file type. Use PDF, DOCX, JPEG, PNG, WEBP, or GIF.");
      setSelectedFile(null);
      resetInput();
      return;
    }

    setFileTypeError(null);
    upload.reset();
    setSelectedFile(file);
    resetUploadState();
    resetInput();
  }

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file || isUploading) return;
    selectFile(file);
  }

  function startUpload() {
    if (!selectedFile || isUploading) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setUploadProgress(0);
    setUploadPhase("signing");

    upload.mutate(
      {
        file: selectedFile,
        folderId: folderId || undefined,
        signal: controller.signal,
        onPhaseChange: setUploadPhase,
        onProgress: setUploadProgress,
      },
      {
        onSuccess: () => {
          setSelectedFile(null);
          resetInput();
        },
        onSettled: (_data, err) => {
          resetUploadState();
          if (err instanceof ApiError && err.message === "Upload cancelled") {
            upload.reset();
          }
        },
      },
    );
  }

  const phaseLabel = uploadPhase ? PHASE_LABELS[uploadPhase] : null;
  const showProgress = isUploading && uploadPhase !== null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Upload documents</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          PDF, DOCX, or images — processed automatically for semantic search.
        </p>
      </div>

      {fileTypeError && <Alert variant="error">{fileTypeError}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}
      {upload.isSuccess && (
        <Alert variant="success">
          Upload started. Check Documents for processing status.
        </Alert>
      )}

      <Card>
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-[var(--color-text)]">
            Target folder (optional)
          </label>
          <select
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            disabled={isUploading}
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] disabled:opacity-60"
          >
            <option value="">Auto-classify after upload</option>
            {folders?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <div
          role="button"
          tabIndex={0}
          onDragOver={(e) => {
            e.preventDefault();
            if (!isUploading && !hasSelection) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!isUploading && !hasSelection) handleFiles(e.dataTransfer.files);
          }}
          onClick={() => !isUploading && !hasSelection && inputRef.current?.click()}
          onKeyDown={(e) =>
            e.key === "Enter" && !isUploading && !hasSelection && inputRef.current?.click()
          }
          className={cn(
            "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-16 transition-colors",
            hasSelection || isUploading
              ? "pointer-events-none border-[var(--color-border)] bg-[var(--color-surface-muted)] opacity-70"
              : "cursor-pointer border-[var(--color-border)] hover:border-brand-400 hover:bg-[var(--color-surface-muted)]",
            dragOver && !hasSelection && "border-brand-500 bg-brand-50 dark:bg-brand-950/30",
          )}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
            {isUploading ? (
              <Upload className="h-7 w-7 animate-pulse" />
            ) : (
              <FileUp className="h-7 w-7" />
            )}
          </div>
          <p className="mt-4 text-sm font-medium text-[var(--color-text)]">
            {isUploading
              ? "Upload in progress…"
              : hasSelection
                ? "File selected — confirm below"
                : "Drop a file here or click to browse"}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            PDF, DOCX, JPEG, PNG, WEBP, GIF — max 10MB
          </p>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={VAULT_ALLOWED_TYPES.join(",")}
            disabled={isUploading || hasSelection}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        {hasSelection && !showProgress && (
          <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--color-text)]">
                  {selectedFile?.name}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                  {selectedFile ? formatFileSize(selectedFile.size) : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={clearSelection}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                aria-label="Remove selected file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={clearSelection}>
                Cancel
              </Button>
              <Button onClick={startUpload}>Upload</Button>
            </div>
          </div>
        )}

        {showProgress && (
          <div className="mt-4 space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--color-text)]">
                  {selectedFile?.name}
                </p>
                <div className="mt-2 flex items-center justify-between text-sm text-[var(--color-text-muted)]">
                  <span>{phaseLabel}</span>
                  <span className="font-medium tabular-nums text-[var(--color-text)]">
                    {uploadPhase === "uploading" ? `${uploadProgress}%` : "…"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={clearSelection}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                aria-label="Cancel upload"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <Progress
              value={
                uploadPhase === "signing"
                  ? 0
                  : uploadPhase === "confirming"
                    ? 100
                    : uploadProgress
              }
            />
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={clearSelection}>
                Cancel upload
              </Button>
            </div>
          </div>
        )}

        {!hasSelection && (
          <div className="mt-4 flex justify-end">
            <Button
              variant="secondary"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
            >
              Select file
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
