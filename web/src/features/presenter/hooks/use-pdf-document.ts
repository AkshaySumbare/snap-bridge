/**
 * The original PDF for one document, ready to render.
 *
 * Three things happen here, and each exists to stop a different kind of waste:
 *
 *   - **One URL request per case.** The signed URLs come from a single query
 *     keyed on the case, so every pane on screen shares it. Asking per
 *     document meant five requests to open a case of five PDFs.
 *   - **Range requests, not whole files.** The session opens the file with
 *     auto-fetch off, so pdf.js pulls the bytes a page needs instead of the
 *     entire bundle before showing page one.
 *   - **A session held across remounts.** Ref-counted in `pdf-session`, so
 *     toggling HighlightView or stepping out of the case and back reuses what
 *     is already open.
 *
 * Failure is never fatal. A document that will not load falls back to the
 * extracted text, which is what the reader showed before any of this existed:
 * less faithful, still readable, still annotatable.
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { presenterKeys } from "../api/keys";
import { acquirePdfSession, type PdfDocument } from "../api/pdf-session";
import { fetchDownloadUrls } from "../api/presenter-api";

export type { PdfDocument } from "../api/pdf-session";

/**
 * How long the signed URLs stay valid.
 *
 * A reading session runs to hours, and the URL is used for the life of the
 * session because ranged loading keeps fetching from it. The service caps
 * this at four hours; the default of one would expire under a reader still
 * working, and later pages would simply stop arriving.
 */
const URL_EXPIRY_MINUTES = 240;

/** Re-minted comfortably before the URLs above go stale. */
const URL_STALE_MS = 3 * 60 * 60 * 1000;

export interface PdfDocumentState {
  pdf: PdfDocument | null;
  loading: boolean;
  /** True once loading has been tried and failed — the caller shows text. */
  failed: boolean;
}

export function usePdfDocument(presenterId: string, documentId: string | null): PdfDocumentState {
  // Shared by every pane in the case: React Query dedupes on the key, so this
  // is one request no matter how many documents are open.
  const urls = useQuery({
    queryKey: presenterKeys.downloadUrls(presenterId),
    queryFn: () => fetchDownloadUrls(presenterId, undefined, URL_EXPIRY_MINUTES),
    enabled: Boolean(presenterId),
    staleTime: URL_STALE_MS,
    refetchOnWindowFocus: false,
  });

  const url =
    urls.data?.files.find((file) => file.documentId === documentId && file.kind === "pdf")?.url ??
    null;

  const [state, setState] = useState<PdfDocumentState>({
    pdf: null,
    loading: true,
    failed: false,
  });

  useEffect(() => {
    if (!documentId) {
      setState({ pdf: null, loading: false, failed: false });
      return undefined;
    }
    if (urls.isPending) {
      setState({ pdf: null, loading: true, failed: false });
      return undefined;
    }
    if (!url) {
      // The case answered and this document has no file in it — nothing to
      // wait for, so the caller can fall back now rather than spin.
      setState({ pdf: null, loading: false, failed: true });
      return undefined;
    }

    let cancelled = false;
    setState({ pdf: null, loading: true, failed: false });

    const session = acquirePdfSession(documentId, url);
    session.document
      .then((pdf) => {
        if (!cancelled) setState({ pdf, loading: false, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ pdf: null, loading: false, failed: true });
      });

    return () => {
      cancelled = true;
      session.release();
    };
  }, [documentId, url, urls.isPending]);

  return state;
}
