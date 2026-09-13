import { useRef, useState } from "react";
import { FileUp, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { useFolders, useUploadDocument } from "../hooks/useVault";
import { VAULT_ALLOWED_TYPES } from "../types/vault.types";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";

export function VaultUploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [folderId, setFolderId] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const { data: folders } = useFolders();
  const upload = useUploadDocument();

  const error =
    upload.error instanceof ApiError ? upload.error.message : upload.error?.message;

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!VAULT_ALLOWED_TYPES.includes(file.type as (typeof VAULT_ALLOWED_TYPES)[number])) {
      return;
    }
    upload.mutate({ file, folderId: folderId || undefined });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Upload documents</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          PDF, DOCX, or images — processed automatically for semantic search.
        </p>
      </div>

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
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)]"
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
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-16 transition-colors",
            dragOver
              ? "border-brand-500 bg-brand-50 dark:bg-brand-950/30"
              : "border-[var(--color-border)] hover:border-brand-400 hover:bg-[var(--color-surface-muted)]",
          )}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
            {upload.isPending ? (
              <Upload className="h-7 w-7 animate-pulse" />
            ) : (
              <FileUp className="h-7 w-7" />
            )}
          </div>
          <p className="mt-4 text-sm font-medium text-[var(--color-text)]">
            Drop a file here or click to browse
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            PDF, DOCX, JPEG, PNG, WEBP, GIF — max 10MB
          </p>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={VAULT_ALLOWED_TYPES.join(",")}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            variant="secondary"
            onClick={() => inputRef.current?.click()}
            loading={upload.isPending}
          >
            Select file
          </Button>
        </div>
      </Card>
    </div>
  );
}
