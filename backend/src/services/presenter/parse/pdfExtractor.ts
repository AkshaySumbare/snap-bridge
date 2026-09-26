
import { createRequire } from "node:module";
import type { IParagraphRun, IParsedParagraph } from "../../../models/presenter/presenterPage.model.js";

const require = createRequire(import.meta.url);

/**
 * Turn a PDF into pages of paragraphs, with geometry.
 *
 * Deliberately a library, not a model. Extraction has to be *deterministic*:
 * the same PDF must yield byte-identical text and the same paragraph split
 * every time, because every highlight in the system is stored as
 * `(paragraphId, start, end)`. An LLM would give slightly different output on
 * each run and quietly move every anchor in the case.
 *
 * pdfjs is loaded lazily so a missing optional dependency cannot crash the
 * service at boot — the parse job fails loudly instead, which is recoverable.
 */

export interface ExtractedPage {
  pageNumber: number;
  width: number;
  height: number;
  paragraphs: IParsedParagraph[];
}

export interface ExtractResult {
  engine: string;
  /**
   * Every page, when the caller wanted them all at once.
   *
   * Empty when an `onPage` handler was given: the pages went to it one at a
   * time and were released, which is the whole point of streaming them.
   */
  pages: ExtractedPage[];
  pageCount: number;
  paragraphCount: number;
  /** True when a page yielded no text layer at all — a scan needing OCR. */
  needsOcr: boolean;
}

/**
 * Receives each page as it is finished.
 *
 * Supplying this makes the extractor hand pages over and forget them rather
 * than building the whole document in memory. Throwing from here stops the
 * extraction — a page that could not be stored is a failed parse, not a gap.
 */
export type ExtractPageHandler = (page: ExtractedPage) => Promise<void> | void;

interface TextItem {
  str: string;
  x: number;
  yBaseline: number;
  width: number;
  height: number;
}

interface Line {
  text: string;
  x0: number;
  x1: number;
  yTop: number;
  yBottom: number;
  height: number;
}

/**
 * Numbering a clause line starts with: "6.2", "6.2.1", "12.", "(a)", "A."
 *
 * A bare digit with no period does NOT count. Requiring the period (or a
 * multi-part number) is what stops a wrapped line like "6 shall not exceed
 * 25%…" — the continuation of clause 6.2 — from being read as the start of a
 * clause called "6" and split off into a paragraph of its own.
 */
const LABEL_PATTERN = /^((?:\d+\.)+\d*|\d+\.|\([a-z0-9]{1,3}\)|[A-Z]\.)\s+/;

const roundTo = (value: number, places: number): number =>
  Math.round(value * 10 ** places) / 10 ** places;

/** Group text fragments into lines by shared baseline. */
const buildLines = (items: TextItem[]): Line[] => {
  const sorted = [...items].sort((a, b) => b.yBaseline - a.yBaseline || a.x - b.x);
  const lines: Line[] = [];
  let current: TextItem[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const ordered = [...current].sort((a, b) => a.x - b.x);
    const height = Math.max(...ordered.map((item) => item.height), 1);
    const yBaseline = ordered[0]!.yBaseline;
    lines.push({
      // Fragments arrive pre-split by the text layer, often mid-word. Join on
      // a space only where the gap is wide enough to be one.
      text: ordered
        .reduce<string>((text, item, index) => {
          if (index === 0) return item.str;
          const previous = ordered[index - 1]!;
          const gap = item.x - (previous.x + previous.width);
          const needsSpace = gap > previous.height * 0.2 && !/\s$/.test(text) && !/^\s/.test(item.str);
          return text + (needsSpace ? " " : "") + item.str;
        }, "")
        .replace(/\s+/g, " ")
        .trim(),
      x0: ordered[0]!.x,
      x1: Math.max(...ordered.map((item) => item.x + item.width)),
      yTop: yBaseline + height,
      yBottom: yBaseline,
      height,
    });
    current = [];
  };

  for (const item of sorted) {
    if (item.str.trim().length === 0) continue;
    if (current.length === 0) {
      current.push(item);
      continue;
    }
    const reference = current[0]!;
    // Same line if the baselines are within half a line height of each other.
    if (Math.abs(item.yBaseline - reference.yBaseline) <= Math.max(reference.height, 1) * 0.5) {
      current.push(item);
    } else {
      flush();
      current.push(item);
    }
  }
  flush();

  return lines.filter((line) => line.text.length > 0);
};

/**
 * Lines that repeat at the same height across most pages: running headers,
 * footers, page numbers. They are not part of any paragraph, and left in they
 * would break sentences in half and shift every offset after them.
 */
const findChrome = (pages: Line[][]): Set<string> => {
  // Two pages is enough to see a repeat. Below that there is nothing to
  // compare against and every line is content until proven otherwise.
  if (pages.length < 2) return new Set();
  const seen = new Map<string, number>();
  for (const lines of pages) {
    const unique = new Set(
      lines.map((line) => `${roundTo(line.yTop, 0)}|${line.text.replace(/\d+/g, "#")}`),
    );
    for (const key of unique) seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const threshold = Math.max(2, Math.floor(pages.length * 0.6));
  return new Set(
    [...seen.entries()].filter(([, count]) => count >= threshold).map(([key]) => key),
  );
};

const isChrome = (line: Line, chrome: Set<string>): boolean =>
  chrome.has(`${roundTo(line.yTop, 0)}|${line.text.replace(/\d+/g, "#")}`);

/**
 * The page's ordinary line spacing, as the median baseline-to-baseline step.
 *
 * Measured, not derived from font size, because `height` cannot be trusted
 * across engines. OCRmyPDF sizes its invisible text to the glyph box it
 * detected rather than the em box, so a line of ordinary 11pt prose reports a
 * height nearer 8pt. Against that, a test of the form `gap > height * 0.6`
 * both under-states the threshold and over-states the gap, and fires on every
 * boundary — which split each line of an OCR'd document into a paragraph of
 * its own. Baselines are the one measurement a born-digital text layer and an
 * OCR'd one agree on.
 *
 * The median rather than the mean: headings, tables and the spaces between
 * paragraphs are all outliers, and the mean chases them.
 */
const medianLeading = (lines: Line[]): number => {
  const steps: number[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const step = lines[index - 1]!.yBottom - lines[index]!.yBottom;
    // Not every neighbouring pair runs down the page: a two-column stretch
    // steps back up, and those pairs say nothing about the leading.
    if (step > 0) steps.push(step);
  }
  if (steps.length === 0) return 0;
  steps.sort((a, b) => a - b);
  return steps[Math.floor(steps.length / 2)]!;
};

/**
 * How much bigger than the leading a step has to be to end a paragraph.
 *
 * Low enough to catch the half-line most typesetting puts between paragraphs,
 * high enough to ignore the jitter OCR leaves in a baseline it inferred from
 * pixels.
 */
const LEADING_BREAK_RATIO = 1.35;

/** Join lines into paragraphs, recording where each line's characters sit. */
const buildParagraphs = (
  lines: Line[],
  pageWidth: number,
  pageHeight: number,
  idFor: (index: number) => string,
): IParsedParagraph[] => {
  const paragraphs: IParsedParagraph[] = [];
  let group: Line[] = [];

  const bodyLeft = lines.length > 0 ? Math.min(...lines.map((line) => line.x0)) : 0;
  const bodyRight = lines.length > 0 ? Math.max(...lines.map((line) => line.x1)) : pageWidth;
  const bodyWidth = Math.max(bodyRight - bodyLeft, 1);
  const leading = medianLeading(lines);

  const flush = () => {
    if (group.length === 0) return;
    const index = paragraphs.length;

    let text = "";
    const runs: IParagraphRun[] = [];
    for (const [position, line] of group.entries()) {
      let piece = line.text;
      if (position > 0) {
        // A word broken across a line break rejoins without its hyphen.
        if (/[A-Za-z]-$/.test(text)) text = text.slice(0, -1);
        else text += " ";
      }
      const start = text.length;
      text += piece;
      runs.push({
        start,
        end: text.length,
        bbox: [
          line.x0 / pageWidth,
          (pageHeight - line.yTop) / pageHeight,
          line.x1 / pageWidth,
          (pageHeight - line.yBottom) / pageHeight,
        ],
      });
    }

    const first = group[0]!;
    let label: string | undefined;
    const labelMatch = LABEL_PATTERN.exec(text);
    if (labelMatch) {
      label = labelMatch[1];
      const consumed = labelMatch[0].length;
      text = text.slice(consumed);
      // Offsets are relative to the text we store, so every run shifts with it.
      for (const run of runs) {
        run.start = Math.max(0, run.start - consumed);
        run.end = Math.max(0, run.end - consumed);
      }
    }

    const heights = group.map((line) => line.height);
    const averageHeight = heights.reduce((sum, value) => sum + value, 0) / heights.length;
    const centred =
      Math.abs((first.x0 - bodyLeft) - (bodyRight - first.x1)) < bodyWidth * 0.08 &&
      first.x0 - bodyLeft > bodyWidth * 0.1;
    const heading =
      group.length <= 2 &&
      (centred || /^[A-Z0-9 ,.—–()'"-]+$/.test(text)) &&
      text.length < 120;

    // Headings are centred rather than indented, so measuring their left edge
    // against the body's would report an indent that is really a centring.
    const indentRatio = (first.x0 - bodyLeft) / bodyWidth;
    const indent = heading ? 0 : indentRatio > 0.18 ? 2 : indentRatio > 0.06 ? 1 : 0;

    paragraphs.push({
      id: idFor(index),
      text: text.trim(),
      ...(label ? { label } : {}),
      ...(heading ? { heading: true } : {}),
      ...(indent ? { indent } : {}),
      bbox: [
        Math.min(...group.map((line) => line.x0)) / pageWidth,
        (pageHeight - Math.max(...group.map((line) => line.yTop))) / pageHeight,
        Math.max(...group.map((line) => line.x1)) / pageWidth,
        (pageHeight - Math.min(...group.map((line) => line.yBottom))) / pageHeight,
      ],
      runs,
    });
    void averageHeight;
    group = [];
  };

  for (const [index, line] of lines.entries()) {
    if (index === 0) {
      group.push(line);
      continue;
    }
    const previous = lines[index - 1]!;
    const breaks =
      // a step down noticeably bigger than the page's own line spacing —
      // falling back to the box gap on a page too short to measure one
      (leading > 0
        ? previous.yBottom - line.yBottom > leading * LEADING_BREAK_RATIO
        : previous.yBottom - line.yTop > previous.height * 0.6) ||
      // a new numbered clause
      LABEL_PATTERN.test(line.text) ||
      // the previous line stopped well short of the right margin
      previous.x1 < bodyRight - bodyWidth * 0.15 ||
      // a step in indentation
      Math.abs(line.x0 - previous.x0) > bodyWidth * 0.04;

    if (breaks) flush();
    group.push(line);
  }
  flush();

  return paragraphs.filter((paragraph) => paragraph.text.length > 0);
};

/**
 * Told how far along the extraction is, as each page is read.
 *
 * Reported rather than inferred: only the extractor knows how many pages the
 * file actually has, and it knows it a fraction of a second after opening —
 * long before the first page is done. Everything downstream can then show a
 * real fraction instead of a spinner that says nothing.
 */
export type ExtractProgress = (pagesDone: number, pageCount: number) => void;

export const extractPdf = async (
  data: Buffer,
  documentId: string,
  parseVersion: number,
  onProgress?: ExtractProgress,
  onPage?: ExtractPageHandler,
): Promise<ExtractResult> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
  const engine = `pdfjs-dist@${pdfjs.version ?? "unknown"}`;

  // Point pdfjs at its own bundled fonts. Without this it warns once per
  // standard font per document — pure log noise on every parse.
  const standardFontDataUrl = `${require.resolve("pdfjs-dist/package.json").replace(/package\.json$/, "")}standard_fonts/`;

  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    standardFontDataUrl,
    // Nothing here should execute anything the document asks it to.
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
  });
  const pdf = await task.promise;

  try {
    const rawPages: { lines: Line[]; width: number; height: number }[] = [];

    // The total, as soon as it is known. A bar that can show 0 of 240 from
    // the first moment is worth more than one that appears at page 1.
    onProgress?.(0, pdf.numPages);

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();

      const items: TextItem[] = content.items
        .filter((item: any) => typeof item.str === "string")
        .map((item: any) => ({
          str: item.str,
          x: item.transform[4],
          yBaseline: item.transform[5],
          width: item.width ?? 0,
          height: item.height || Math.abs(item.transform[3]) || 10,
        }));

      rawPages.push({
        lines: buildLines(items),
        width: viewport.width,
        height: viewport.height,
      });
      page.cleanup();
      onProgress?.(pageNumber, pdf.numPages);
    }

    /*
     * Chrome first, and it needs every page.
     *
     * Running headers and footers are found by looking for lines that repeat
     * across most of the document, so no page can be finalised until all of
     * them have been read. That is why the line pass above is not itself
     * streamed — and why a failure while reading pages still writes nothing.
     */
    const chrome = findChrome(rawPages.map((page) => page.lines));

    const pageCount = rawPages.length;
    const pages: ExtractedPage[] = [];
    let paragraphCount = 0;

    for (let index = 0; index < pageCount; index += 1) {
      const raw = rawPages[index]!;
      const pageNumber = index + 1;
      const body = raw.lines.filter((line) => !isChrome(line, chrome));

      const page: ExtractedPage = {
        pageNumber,
        width: raw.width,
        height: raw.height,
        paragraphs: buildParagraphs(
          body,
          raw.width,
          raw.height,
          (paragraphIndex) => `${documentId}:v${parseVersion}:p${pageNumber}:i${paragraphIndex}`,
        ),
      };
      paragraphCount += page.paragraphs.length;

      if (onPage) {
        await onPage(page);
        // Handed over and stored, so neither the lines it came from nor the
        // page itself is held any longer. On a long document this is the
        // difference between holding two copies of it and holding one.
        rawPages[index] = { lines: [], width: raw.width, height: raw.height };
      } else {
        pages.push(page);
      }
    }

    const needsOcr = paragraphCount === 0 && pageCount > 0;
    if (needsOcr) {
      console.warn(
        `[presenter] ${documentId} has no text layer on any page — OCR required`,
      );
    }

    return { engine, pages, pageCount, paragraphCount, needsOcr };
  } finally {
    await pdf.destroy();
  }
};
