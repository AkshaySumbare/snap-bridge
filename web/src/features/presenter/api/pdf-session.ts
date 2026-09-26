/**
 * Shared, ref-counted pdf.js sessions for Presenter.
 *
 * Deliberately Presenter's own, and not the one doc-compiler keeps. The two
 * features want different things from a session — doc-compiler opens one file
 * per row in a list, Presenter holds several documents open in one scroll —
 * and a shared helper would end up serving neither well while looking like it
 * served both. Keeping them apart costs a small amount of duplication and
 * buys the freedom to change one without reading the other.
 *
 * Two things this exists to prevent:
 *
 *   - **Re-downloading on every remount.** The reader unmounts whenever
 *     HighlightView takes the pane, and again on leaving the case. Without a
 *     session held across that, coming back pulled every PDF down again.
 *   - **Duplicate sessions for one file.** Several panes can ask for the same
 *     document at once; each would otherwise open its own copy of the header
 *     and cross-reference table and parse the file again.
 */

/** Loosely typed: pdf.js ships its own types, and we touch very little. */
export interface PdfDocument {
  numPages: number;
  getPage: (pageNumber: number) => Promise<{
    getViewport: (options: { scale: number }) => { width: number; height: number };
    render: (options: {
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
    }) => { promise: Promise<void>; cancel: () => void };
    cleanup: () => void;
  }>;
  destroy: () => Promise<void>;
}

/**
 * Fetch only the bytes a page needs, over HTTP range requests.
 *
 * Without these pdf.js pulls the whole file before rendering anything, so a
 * 600-page bundle is a full download to read its first screen.
 */
const RANGED = { disableAutoFetch: true, disableStream: true } as const;

/**
 * How long an unreferenced session is kept alive.
 *
 * Long enough that toggling HighlightView, or stepping out of the case and
 * back, reuses what is already open rather than starting again.
 */
const GRACE_MS = 30_000;

interface Entry {
  document: Promise<PdfDocument>;
  refs: number;
  destroyTimer: ReturnType<typeof setTimeout> | null;
  /** Kept so a cancelled load can be told to stop. */
  cancel: () => void;
}

/**
 * Keyed by document, never by URL.
 *
 * Every call to `download-urls` mints a fresh signature, so the same file
 * arrives under a different URL each time — keying on it would mean a new
 * session on every hydration and no sharing at all.
 */
const sessions = new Map<string, Entry>();

export interface PdfSession {
  document: Promise<PdfDocument>;
  release: () => void;
}

export function acquirePdfSession(documentId: string, url: string): PdfSession {
  let entry = sessions.get(documentId);

  if (entry) {
    if (entry.destroyTimer) {
      clearTimeout(entry.destroyTimer);
      entry.destroyTimer = null;
    }
  } else {
    let cancelled = false;
    const created: Entry = {
      refs: 0,
      destroyTimer: null,
      cancel: () => {
        cancelled = true;
      },
      document: (async () => {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const task = pdfjs.getDocument({ url, ...RANGED });
        const loaded = (await task.promise) as unknown as PdfDocument;

        // Released while the header was in flight: hand it straight back
        // rather than leaving a worker running for a pane nobody is on.
        if (cancelled) {
          void loaded.destroy();
          throw new Error("pdf session released before it opened");
        }
        return loaded;
      })(),
    };
    // A rejection nobody is waiting on yet is still a rejection; the caller
    // attaches its own handler a moment later.
    created.document.catch(() => undefined);
    sessions.set(documentId, created);
    entry = created;
  }

  entry.refs += 1;
  let released = false;

  return {
    document: entry.document,
    release: () => {
      // Guarded: React can run a cleanup twice under StrictMode, and a double
      // release would drop the count below zero and destroy a live session.
      if (released) return;
      released = true;

      const held = sessions.get(documentId);
      if (!held) return;
      held.refs -= 1;
      if (held.refs > 0) return;

      held.destroyTimer = setTimeout(() => {
        // Re-read: something may have taken it during the grace period.
        const current = sessions.get(documentId);
        if (!current || current.refs > 0) return;
        sessions.delete(documentId);
        current.cancel();
        void current.document.then((loaded) => loaded.destroy()).catch(() => undefined);
      }, GRACE_MS);
    },
  };
}

/** Test seam: drop every session without waiting out the grace period. */
export function __resetPdfSessions(): void {
  for (const [key, entry] of sessions) {
    if (entry.destroyTimer) clearTimeout(entry.destroyTimer);
    entry.cancel();
    void entry.document.then((loaded) => loaded.destroy()).catch(() => undefined);
    sessions.delete(key);
  }
}
