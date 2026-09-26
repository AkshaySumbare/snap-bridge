import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/lib/sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCreatePresenter } from "../api/use-presenter";

export function PresenterCreatePage() {
  const navigate = useNavigate();
  const createPresenter = useCreatePresenter();
  const [name, setName] = useState("");
  const [subtitle, setSubtitle] = useState("");

  async function submit() {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    try {
      const created = await createPresenter.mutateAsync({
        name: trimmed,
        client: subtitle.trim(),
      });
      toast.success(`“${trimmed}” created`);
      navigate(`/presenter/${created.id}`, { replace: true });
    } catch {
      toast.error("Could not create the presenter. Try again.");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-xl font-semibold text-foreground">New presenter</h1>
        <p className="mt-1 text-sm text-text-secondary">
          A presenter is a folder for documents you want to read and annotate. It starts empty —
          add PDFs after you open it.
        </p>
      </div>

      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Name"
        autoFocus
        onKeyDown={(event) => {
          if (event.key === "Enter") void submit();
        }}
      />
      <Input
        value={subtitle}
        onChange={(event) => setSubtitle(event.target.value)}
        placeholder="Subtitle (optional)"
        onKeyDown={(event) => {
          if (event.key === "Enter") void submit();
        }}
      />

      <div className="flex justify-end gap-2">
        <Button variant="ghost" type="button" onClick={() => navigate("/presenter")}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={name.trim().length === 0 || createPresenter.isPending}
          onClick={() => void submit()}
        >
          {createPresenter.isPending ? "Creating…" : "Create"}
        </Button>
      </div>
    </div>
  );
}
