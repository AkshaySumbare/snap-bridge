import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";



const execFileAsync = promisify(execFile);

/**
 * Give a scanned PDF a text layer, so the ordinary extractor can read it.
 *
 * Deliberately a pre-processing step and nothing more. OCRmyPDF writes the
 * recognised words back into the PDF as invisible text, positioned over the
 * pixels they were read from — so what comes out is an ordinary text PDF and
 * `extractPdf` handles it with no idea OCR ever happened. Paragraph ids,
 * `runs`, bounding boxes and every anchor built on them keep working exactly
 * as they do for a born-digital file.
 *
 * The alternative — calling an OCR engine directly and mapping its words into
 * our own paragraph shape — would mean a second, subtly different extractor
 * to keep in step with the first. One extractor is the point.
 */

/** Long enough for a few hundred pages; short enough to fail a hung binary. */
const TIMEOUT_MS = 30 * 60 * 1000;
/** Tesseract is CPU-bound, and the parse worker already limits concurrency. */
const THREADS = "2";

let available: boolean | null = null;

/**
 * Whether OCR can run at all, probed once.
 *
 * Missing is not an error: the service still parses every born-digital PDF,
 * and a scan is reported honestly as having no text rather than failing the
 * whole document. Ghostscript is treated the same way by the doc compiler.
 */
export const isOcrAvailable = async (): Promise<boolean> => {
  if (available !== null) return available;
  try {
    await execFileAsync("ocrmypdf", ["--version"], { timeout: 30_000 });
    available = true;
  } catch {
    console.warn("[presenter] ocrmypdf not installed — scanned PDFs will have no text");
    available = false;
  }
  return available;
};

/**
 * Returns the PDF with an added text layer, or null if it could not be added.
 *
 * Null rather than a throw: a scan we cannot read is still a document worth
 * showing. The reader gets the pages and can annotate nothing on them, which
 * is what they had before — a failed parse would take even that away.
 */
export const addTextLayer = async (
  data: Buffer,
  documentId: string,
): Promise<Buffer | null> => {
  if (!(await isOcrAvailable())) return null;

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "presenter-ocr-"));
  const input = path.join(dir, "in.pdf");
  const output = path.join(dir, "out.pdf");

  try {
    await fs.writeFile(input, data);
    const started = Date.now();

    await execFileAsync(
      "ocrmypdf",
      [
        // Leave any page that already has text alone. This runs only when the
        // document looked like a scan, but a file can be mixed — a scanned
        // exhibit bound into a digital brief — and re-OCRing real text would
        // replace it with a guess at it.
        "--skip-text",
        "--language",
        "eng",
        // Straighten and clean the page before reading it. Court copies are
        // photocopies of photocopies; a degree of skew costs real accuracy.
        "--deskew",
        /*
         * NOT `--pdf-renderer sandwich`.
         *
         * Its text-only output is documented as segmenting badly in pdf.js
         * specifically — words run together — and pdf.js is exactly what
         * reads this afterwards. The default renderer is the compatible one.
         */
        "--jobs",
        THREADS,
        "--quiet",
        input,
        output,
      ],
      { timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
    );

    const bytes = await fs.readFile(output);
    console.info(
      `[presenter] OCR added a text layer to ${documentId} in ${Date.now() - started}ms ` +
        `(${data.length} → ${bytes.length} bytes)`,
    );
    return bytes;
  } catch (error: any) {
    console.error(
      `[presenter] OCR failed for ${documentId}: ${String(error?.message ?? error)}`,
    );
    return null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
};

/** Test seam: lets a test force the probe result instead of shelling out. */
export const __setOcrAvailable = (value: boolean | null): void => {
  available = value;
};
