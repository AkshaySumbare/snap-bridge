import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";

export function PresenterInvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ presenterId: string }>(`/presenter/invites/${token}/accept`);
      navigate(`/presenter/${result.presenterId}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept invite");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void accept();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <h1 className="text-xl font-semibold">Joining presenter…</h1>
      {error ? (
        <>
          <p className="text-sm text-red-500">{error}</p>
          <Button type="button" onClick={() => void accept()} loading={busy}>
            Try again
          </Button>
        </>
      ) : (
        <p className="text-sm text-[var(--color-text-muted)]">Accepting your invite.</p>
      )}
    </div>
  );
}
