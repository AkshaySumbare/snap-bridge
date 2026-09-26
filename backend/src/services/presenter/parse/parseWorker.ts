import crypto from "crypto";
import zlib from "zlib";
import { promisify } from "util";
import mongoose from "mongoose";

import PresenterDocument, {
  type IPresenterDocument,
} from "../../../models/presenter/presenterDocument.model.js";
import PresenterPage from "../../../models/presenter/presenterPage.model.js";
import { bundleBlobPath, downloadBuffer, uploadBuffer } from "../blob.js";
import { withSeq } from "../seq.js";
import { extractPdf, type ExtractedPage } from "./pdfExtractor.js";
import { addTextLayer } from "./ocr.js";

/**
 * Extraction: PDF in, pages of paragraphs out.
 *
 * Triggered by the upload that needs it, and by an explicit retry. There is no
 * background poller — the only thing one could do is recover a parse that died
 * with its process, and a Presenter case belongs to one person: the reader who
 * uploaded the file is the only one waiting for it. Recovering silently at 3am
 * serves nobody, and it hides a failure the reader should be told about. So a
 * dead parse is surfaced as `stalled` on read (see `effectiveParseStatus`) and
 * the UI offers a retry.
 *
 * Runs off the request thread because extraction is CPU-bound and holds the
 * event loop; inline it would stall everything else this service is serving.
 */

/** How often progress reaches the database while a parse runs. */
const PROGRESS_WRITE_MS = 1_000;
const gzip = promisify(zlib.gzip);
/** A claim older than this belonged to a worker that died mid-parse. */
const STALE_CLAIM_MS = 15 * 60 * 1000;

/**
 * Documents that are fair game: queued, or claimed by a worker that then died.
 */
/**
 * Documents that are fair game: queued, or claimed by a worker that then died.
 *
 * Deliberately uncapped. Nothing retries on its own, so a parse only ever runs
 * because someone asked for it — and refusing the fourth ask would leave a
 * reader holding a document they cannot open and no way to try again. The
 * count of attempts is recorded for the log and governs nothing.
 */
const claimable = () => ({
  isDeleted: false,
  /**
   * `ready` is absent from this list, and that is load-bearing rather than
   * incidental: a PDF is parsed once and never re-parsed, so a document that
   * has finished can never be claimed again. Paragraph ids are what every
   * highlight is anchored to, and re-extracting would renumber them underneath
   * annotations that already exist. `resetParse` carries the same guard, since
   * it is the only thing that could move a document out of `ready`.
   */
  $or: [
    { "parse.status": "pending" },
    { "parse.status": "running", "parse.startedAt": { $lt: new Date(Date.now() - STALE_CLAIM_MS) } },
  ],
});

/**
 * A function, not a constant.
 *
 * As an object literal its `new Date()` was evaluated once, at import — so
 * every claim stamped `startedAt` with the moment the process booted. Fifteen
 * minutes of uptime later, `effectiveParseStatus` would read every running
 * parse as abandoned and offer the reader a retry for work that was going
 * perfectly well.
 *
 * `pagesDone` is zeroed here so a retry starts its bar at nothing rather than
 * inheriting how far the attempt before it happened to get.
 */
const claim = () => ({
  $set: {
    "parse.status": "running",
    "parse.startedAt": new Date(),
    "parse.pagesDone": 0,
    "parse.error": null,
    serverUpdatedAt: new Date(),
  },
  $inc: { "parse.attempts": 1 },
});

/**
 * Take one document, atomically.
 *
 * Every route into extraction goes through this, so two callers racing on the
 * same document cannot both take it.
 */
const claimById = (documentId: mongoose.Types.ObjectId) =>
  PresenterDocument.findOneAndUpdate({ _id: documentId, ...claimable() }, claim(), { new: true });

const runParse = async (document: IPresenterDocument): Promise<void> => {
  const documentId = document._id;
  const started = Date.now();
  try {
    const data = await downloadBuffer(
      document.blob.path,
      document.blob.container,
      document.blob.secureUrl,
    );
    const checksum = crypto.createHash("sha256").update(data).digest("hex");

    /**
     * Same bytes, same parse. Re-importing a document the firm already holds
     * costs nothing, and — more importantly — cannot produce a second set of
     * paragraph ids for text that has not changed.
     */
    if (document.blob.checksumSha256 === checksum && document.parse.status === "ready") {
      console.info(`[presenter] ${documentId} already parsed for this checksum`);
      return;
    }

    const parseVersion = document.parse.version || 1;

    /**
     * Progress, written straight to the row so the rail can show a real bar.
     *
     * Throttled, and deliberately: a 600-page file would otherwise be 600
     * writes for a number nobody reads that closely. One write per second is
     * far finer than the eye needs on a bar, and the first call — carrying
     * the page total with zero done — always goes, because that is what turns
     * "Reading…" into "0 of 240".
     *
     * `updateOne` rather than the loaded document, so a progress write cannot
     * carry a half-finished parse block back to the database. The in-memory
     * copy is kept in step for the final `save`.
     */
    let lastWrite = 0;
    const reportProgress = (pagesDone: number, pageCount: number) => {
      document.parse.pagesDone = pagesDone;
      document.parse.pageCount = pageCount;

      const now = Date.now();
      const finished = pagesDone === pageCount;
      if (pagesDone !== 0 && !finished && now - lastWrite < PROGRESS_WRITE_MS) return;
      lastWrite = now;

      void PresenterDocument.updateOne(
        { _id: documentId },
        { $set: { "parse.pagesDone": pagesDone, "parse.pageCount": pageCount } },
      ).catch(() => {
        // A dropped progress write is not worth failing a parse over. The
        // next one — or the final save — puts the number right.
      });
    };

    /*
     * Cleared before anything is written, not after.
     *
     * Pages now arrive one at a time, so there is no single moment to swap
     * old for new — a previous attempt's rows have to be gone before the
     * first of this attempt's arrives, or the two versions would interleave.
     *
     * A re-parse never edits a page in place: live annotations are anchored
     * to the version they were made on, so a new parse writes a new version
     * and this only ever clears rows belonging to the attempt being redone.
     */
    await PresenterPage.deleteMany({ documentId, parseVersion });

    /*
     * Each page stored as it is finished, so the extractor can let it go.
     *
     * A throw here stops the extraction, which is what should happen: a page
     * that could not be stored is a failed parse, not a document with a hole
     * in it. What is already written stays until the retry's `deleteMany`
     * above clears it, and nothing serves it in the meantime — `getPages`
     * refuses anything whose parse is not `ready`.
     */
    const storePage = async (page: ExtractedPage): Promise<void> => {
      await PresenterPage.create({
        firmId: document.firmId,
        presenterId: document.presenterId,
        documentId,
        parseVersion,
        pageNumber: page.pageNumber,
        width: page.width,
        height: page.height,
        paragraphs: page.paragraphs,
      });
    };

    let result = await extractPdf(
      data,
      String(documentId),
      parseVersion,
      reportProgress,
      storePage,
    );

    /*
     * Nothing to read: the document is a scan, so give it something to read.
     *
     * OCR writes the recognised words back into the PDF as an invisible text
     * layer, which means the second pass is the ordinary extractor doing the
     * ordinary thing — same paragraph ids, same `runs`, same geometry. There
     * is no second extraction path to keep in step with the first.
     *
     * Only reached when the whole document came back empty, so the wasted
     * first pass costs a read of a file that had no text to process anyway.
     * The pages it wrote are cleared before the retry writes its own, for the
     * same reason the attempt above cleared the previous version's.
     */
    if (result.needsOcr) {
      console.info(`[presenter] ${documentId} has no text layer — running OCR`);
      const ocred = await addTextLayer(data, String(documentId));
      if (ocred) {
        await PresenterPage.deleteMany({ documentId, parseVersion });
        result = await extractPdf(
          ocred,
          String(documentId),
          parseVersion,
          reportProgress,
          storePage,
        );
        if (result.needsOcr) {
          console.warn(`[presenter] OCR produced no text for ${documentId}`);
        }
      }
    }

    /*
     * A scan we could not read is a failure, not an empty success.
     *
     * Under parse-once this is the difference between a document that can be
     * fixed and one that cannot: a `ready` document with no text would be
     * locked in that state for ever, unopenable and unretryable, even after
     * OCR is installed. Failing it keeps the retry available.
     */
    if (result.needsOcr || result.paragraphCount === 0) {
      throw new Error(
        "NEEDS_OCR: no text could be extracted from this PDF. If it is a scan, " +
          "OCR must be available on the service before it can be read.",
      );
    }

    /*
     * The offline bundle: every page of this parse as one gzipped blob.
     *
     * A device taking a case to court needs the paragraph geometry, and the
     * alternative is paging `/pages` twenty-five at a time through a gateway
     * that times out at two minutes — roughly twenty-four round trips for a
     * 600-page bundle. One download instead.
     *
     * Written once and never rewritten, because the parse behind it never runs
     * again, so a device that has fetched and verified it holds it for the life
     * of the document. The sha256 is what lets it verify, and what lets it skip
     * a file it already has.
     */
    const pages = await PresenterPage.find(
      { documentId, parseVersion },
      { _id: 0, pageNumber: 1, width: 1, height: 1, paragraphs: 1 },
    )
      .sort({ pageNumber: 1 })
      .lean();
    const bundle = await gzip(
      Buffer.from(
        JSON.stringify({
          documentId: String(documentId),
          parseVersion,
          pageCount: result.pageCount,
          paragraphCount: result.paragraphCount,
          pages,
        }),
      ),
    );
    const bundlePath = bundleBlobPath(String(document.presenterId), String(documentId), parseVersion);
    await uploadBuffer(
      bundlePath,
      bundle,
      "application/json",
      // Immutable by construction, so it can be cached for as long as anyone
      // cares to keep it.
      "public, max-age=31536000, immutable",
      document.blob.container,
    );
    document.parse.bundleBlobPath = bundlePath;
    document.parse.bundleSizeBytes = bundle.byteLength;
    document.parse.bundleSha256 = crypto.createHash("sha256").update(bundle).digest("hex");

    document.blob.checksumSha256 = checksum;
    document.parse.status = "ready";
    document.parse.engine = result.engine;
    document.parse.pageCount = result.pageCount;
    document.parse.pagesDone = result.pageCount;
    document.parse.paragraphCount = result.paragraphCount;
    document.parse.error = null;
    document.parse.completedAt = new Date();
    document.ocrComplete = !result.needsOcr;
    await withSeq(document.presenterId, async (stamp) => {
      Object.assign(document, stamp);
      await document.save();
    });

    console.info(
      `[presenter] parsed ${documentId}: ${result.pageCount} pages, ` +
        `${result.paragraphCount} paragraphs in ${Date.now() - started}ms`,
    );
  } catch (error: any) {
    /*
     * Failed, always — never "pending".
     *
     * `pending` means queued, and something queued is something a worker will
     * pick up. There is no such worker: the reader is the retry mechanism. Left
     * as pending, a document that had failed sat in the rail showing "Reading…"
     * for ever, with no retry offered and nothing coming to rescue it.
     */
    document.parse.status = "failed";
    document.parse.error = String(error?.message ?? error).slice(0, 500);
    try {
      await withSeq(document.presenterId, async (stamp) => {
        Object.assign(document, stamp);
        await document.save();
      });
    } catch (saveError) {
      // The case may have been purged while this parsed; nothing left to record on.
      console.error(`[presenter] could not record parse failure for ${documentId}`, saveError);
      return;
    }
    console.error(
      `[presenter] parse failed for ${documentId} (attempt ${document.parse.attempts}): ${document.parse.error}`,
    );
  }
};

/**
 * How many extractions may run at once.
 *
 * Two, and not configurable. Raising it looks like a throughput dial and is
 * really a memory one: each parse holds the file three times over — the
 * upload buffer, the worker's download, and the copy pdf.js makes — which at
 * the 200MB upload limit is roughly 600MB apiece against about 25MB of parsed
 * output. Twenty files arriving at once would ask for twelve gigabytes.
 *
 * A bigger box does not help, because more cores do not bring more RAM, and
 * an env var invites exactly that reasoning during an incident. When the file
 * copies are gone a parse will cost a quarter of what it does now, and this
 * can be reconsidered with the arithmetic in front of whoever changes it.
 *
 * Note it is per process: three replicas allow six concurrent parses, so the
 * number to reason about when scaling out is not this one.
 */
const MAX_CONCURRENT_PARSES = 2;

let active = 0;
const waiting: Array<() => void> = [];

const acquire = (): Promise<void> =>
  new Promise((resolve) => {
    if (active < MAX_CONCURRENT_PARSES) {
      active += 1;
      resolve();
      return;
    }
    waiting.push(() => {
      active += 1;
      resolve();
    });
  });

const release = (): void => {
  active -= 1;
  waiting.shift()?.();
};

/**
 * Parse one document, now.
 *
 * Claims first, so two callers racing on the same document — an upload and a
 * retry, say — cannot both extract it. Whichever conditional update lands
 * first flips the status; the other matches nothing and returns quietly.
 *
 * Returns what happened, so the retry endpoint can tell the reader whether it
 * actually started anything.
 */
export const parseDocumentNow = async (
  documentId: mongoose.Types.ObjectId,
): Promise<"started" | "busy"> => {
  const claimed = await claimById(documentId);
  // Nothing to claim means it is already `ready` (parse-once) or someone else
  // is holding it. Both are "not yours to start".
  if (!claimed) return "busy";

  // So the rail on every other device learns this is parsing, not just the one
  // that asked. A status change nobody can pull is a spinner that never moves.
  await withSeq(claimed.presenterId, (stamp) =>
    PresenterDocument.updateOne({ _id: documentId }, { $set: stamp }),
  );

  // Queued behind the concurrency limit, not awaited by the caller: the claim
  // is already recorded, so the rail shows "Parsing…" from this moment.
  void (async () => {
    await acquire();
    try {
      await runParse(claimed);
    } finally {
      release();
    }
  })();

  return "started";
};

/**
 * Reset a document so it can be parsed again from scratch.
 *
 * Used by the retry endpoint: a parse that failed, or one stalled by a
 * process that died, is put back to queued before it can be
 * claimed again.
 */
export const resetParse = (documentId: mongoose.Types.ObjectId, presenterId: mongoose.Types.ObjectId) =>
  PresenterDocument.findOneAndUpdate(
    {
      _id: documentId,
      presenterId,
      isDeleted: false,
      /**
       * Never a `ready` document. This is the guard that makes parse-once real
       * at the database rather than only in the controller, so a second caller
       * — a script, a future endpoint, a retry racing a first one — cannot get
       * round it. `running` is excluded too: a live parse is not something to
       * reset underneath itself, only a stalled one, which `presentParse`
       * reports as `stalled` and which is `running` with an old claim.
       */
      "parse.status": { $in: ["failed", "running"] },
    },
    {
      $set: {
        "parse.status": "pending",
        "parse.attempts": 0,
        "parse.error": null,
        "parse.startedAt": null,
        // Back to nothing read, so the bar restarts rather than resuming from
        // wherever the last attempt gave out.
        "parse.pagesDone": 0,
        serverUpdatedAt: new Date(),
      },
    },
    { new: true },
  );
