import { useState } from "react";
import { Folder, FolderPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PageLoader } from "@/components/ui/Loader";
import { useCreateFolder, useFolders } from "../hooks/useVault";
import { vaultApi } from "../api/vault.api";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { Alert } from "@/components/ui/Alert";

export function VaultFoldersPage() {
  const [name, setName] = useState("");
  const { data: folders, isLoading } = useFolders();
  const createFolder = useCreateFolder();
  const queryClient = useQueryClient();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete(id: string, type: string) {
    if (type === "system") return;
    setDeleteError(null);
    try {
      await vaultApi.deleteFolder(id);
      queryClient.invalidateQueries({ queryKey: ["vault", "folders"] });
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Folders</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          System folders auto-classify uploads. Create custom folders for projects.
        </p>
      </div>

      <Card title="Create folder">
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            createFolder.mutate(name.trim(), { onSuccess: () => setName("") });
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. AWS Interview Prep"
            className="min-w-[200px] flex-1"
          />
          <Button type="submit" loading={createFolder.isPending}>
            <FolderPlus className="h-4 w-4" />
            Create
          </Button>
        </form>
      </Card>

      {deleteError && <Alert variant="error">{deleteError}</Alert>}

      {isLoading ? (
        <PageLoader label="Loading folders..." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {folders?.map((folder) => (
            <Card key={folder.id} className="!p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                    <Folder className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-[var(--color-text)]">{folder.name}</p>
                    <p className="text-xs capitalize text-[var(--color-text-muted)]">
                      {folder.type}
                      {folder.smartCategory ? ` · ${folder.smartCategory}` : ""}
                    </p>
                  </div>
                </div>
                {folder.type === "custom" && (
                  <button
                    type="button"
                    onClick={() => handleDelete(folder.id, folder.type)}
                    className="rounded-lg p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
