import { z } from "zod";

/**
 * Wire shapes for the Presenter backend, validated at the client boundary.
 *
 * Deliberately looser than the UI types in `../types`: the server is the one
 * place ids, timestamps and enums are authoritative, and a response that
 * disagrees should fail here — loudly, at the seam — rather than halfway
 * through a render.
 */

/**
 * Tolerant, deliberately — and the one place in this file that is.
 *
 * Ids and timestamps should fail loudly if the server disagrees with us. An
 * enum must not: mobile and web ship independently, so the moment either adds a
 * colour, a card kind or a parse state, the other receives a value it has never
 * heard of. Strict, that failed the parse for the *entire* sync response — and
 * since the push had already landed, the client could not advance its snapshot
 * and re-pushed the same batch forever, overwriting the new value on every
 * attempt while the chip read "not saved".
 *
 * Falling back is not ideal — an unknown colour is shown, and pushed back, as
 * `clear` — but it is a single field rendering wrong, not a case that cannot
 * save. Preserving unknown values through the round trip is the wire package's
 * job, not a schema default's.
 */
const HighlightColorSchema = z
  .enum(["red", "green", "blue", "yellow", "magenta", "cyan", "clear"])
  .catch("clear");

/** A folder tile on the landing screen. */
export const WirePresenterSchema = z.object({
  id: z.string(),
  name: z.string(),
  client: z.string().default(""),
  accent: z.string().default("blue"),
  updatedAt: z.string(),
  isOwner: z.boolean().default(true),
  sharedWith: z.array(z.string()).default([]),
  documentCount: z.number().default(0),
  excerptCount: z.number().default(0),
});
export const WirePresenterListSchema = z.array(WirePresenterSchema);

/** Per-presenter access list (members + pending email invites). */
export const WireCollaboratorsSchema = z.object({
  ownerId: z.string().nullable(),
  members: z
    .array(
      z.object({
        id: z.string(),
        email: z.string(),
        name: z.string().nullable().optional(),
        avatarUrl: z.string().nullable().optional(),
      }),
    )
    .default([]),
  invites: z
    .array(
      z.object({
        id: z.string(),
        email: z.string(),
        status: z.string(),
        createdAt: z.coerce.string(),
      }),
    )
    .default([]),
});
export type WireCollaborators = z.infer<typeof WireCollaboratorsSchema>;

/**
 * Parse state as the server reports it — note `stalled`, which is derived on
 * read rather than stored: a parse whose process died. The reader is offered
 * a retry instead of a spinner that will never stop.
 */
export const WireParseSchema = z.object({
  // Tolerant for the same reason as the colour above: a parse state this build
  // has not heard of must not take the whole response down with it.
  status: z.enum(["pending", "running", "ready", "failed", "stalled"]).catch("pending"),
  version: z.number().default(1),
  pageCount: z.number().default(0),
  /**
   * Pages read so far, against `pageCount` as the total. Both are set the
   * moment the file opens, so the rail can show a real fraction from the
   * first second rather than an indefinite spinner.
   */
  pagesDone: z.number().default(0),
  paragraphCount: z.number().default(0),
  error: z.string().nullable().default(null),
  canRetry: z.boolean().default(false),
});

export type WireParse = z.infer<typeof WireParseSchema>;

export const WireDocumentSchema = z.object({
  _id: z.string(),
  /**
   * A pull carries tombstones as well as live rows — that is how a device
   * learns a document was removed rather than finding a silent gap — so this
   * is present and meaningful on the sync path.
   */
  isDeleted: z.boolean().default(false),
  title: z.string(),
  originalFileName: z.string().default(""),
  kind: z.enum(["pdf", "docx", "webpage"]).default("pdf"),
  folderId: z.string().nullable().default(null),
  order: z.number().default(0),
  ocrComplete: z.boolean().default(false),
  parse: WireParseSchema,
});

const WireRunSchema = z.object({
  start: z.number(),
  end: z.number(),
  bbox: z.array(z.number()),
});

export const WireParagraphSchema = z.object({
  id: z.string(),
  text: z.string(),
  label: z.string().optional(),
  heading: z.boolean().optional(),
  indent: z.number().optional(),
  bbox: z.array(z.number()).optional(),
  /** Char-range → rectangle. Only mobile needs it; the web reader ignores it. */
  runs: z.array(WireRunSchema).optional(),
});

export const WirePagesResponseSchema = z.object({
  documentId: z.string(),
  parseVersion: z.number(),
  pageCount: z.number(),
  from: z.number(),
  to: z.number(),
  pages: z.array(
    z.object({
      pageNumber: z.number(),
      width: z.number().optional(),
      height: z.number().optional(),
      paragraphs: z.array(WireParagraphSchema),
    }),
  ),
});

// ── annotation nodes ────────────────────────────────────────────────────────

const nodeBase = {
  _id: z.string(),
  lastModifiedAt: z.string(),
  isDeleted: z.boolean().default(false),
  version: z.number().default(1),
};

export const WireWrapperSchema = z.object({
  ...nodeBase,
  title: z.string().default(""),
  order: z.number().default(0),
});
export const WireCardSchema = z.object({
  ...nodeBase,
  kind: z.enum(["note", "excerpt"]),
  wrapperId: z.string().nullable().default(null),
  order: z.number().default(0),
  title: z.string().default(""),
  text: z.string().default(""),
  color: HighlightColorSchema.default("clear"),
  placement: z.enum(["margin", "canvas"]).default("canvas"),
  documentId: z.string().nullable().default(null),
  pageNumber: z.number().nullable().default(null),
  highlightId: z.string().nullable().default(null),
});
export const WireLinkSchema = z.object({
  ...nodeBase,
  cardId: z.string(),
  label: z.string().default(""),
  documentIds: z.array(z.string()).default([]),
  order: z.number().default(0),
});
export const WireConnectionSchema = z.object({
  ...nodeBase,
  cardId: z.string(),
  linkId: z.string().nullable().default(null),
  documentId: z.string(),
  pageNumber: z.number(),
  paragraphId: z.string(),
  parseVersion: z.number().default(1),
  ratioX: z.number(),
  ratioY: z.number(),
});
export const WireHighlightSchema = z.object({
  ...nodeBase,
  documentId: z.string(),
  pageNumber: z.number(),
  paragraphId: z.string(),
  parseVersion: z.number().default(1),
  start: z.number(),
  end: z.number(),
  color: HighlightColorSchema,
  text: z.string().default(""),
  visibility: z.enum(["shared", "private"]).default("shared"),
});

const nodeSets = {
  wrappers: z.array(WireWrapperSchema).default([]),
  cards: z.array(WireCardSchema).default([]),
  links: z.array(WireLinkSchema).default([]),
  connections: z.array(WireConnectionSchema).default([]),
  highlights: z.array(WireHighlightSchema).default([]),
};

/** Everything needed to open a case, in one response. */
export const WireBootstrapSchema = z.object({
  serverTime: z.string(),
  cursor: z.string(),
  /** The case itself, so opening one is genuinely a single call. */
  case: z
    .object({ id: z.string(), name: z.string(), client: z.string().default("") })
    .nullable()
    .default(null),
  documents: z.array(WireDocumentSchema).default([]),
  ...nodeSets,
});

/**
 * The sync reply. `results` is the verdict per node pushed; `pull` is
 * everything that changed server-side since the caller's cursor, tombstones
 * included — a device that never sees the tombstone never removes the node.
 */
export const WireSyncResponseSchema = z.object({
  serverTime: z.string(),
  cursor: z.string(),
  results: z
    .array(
      z.object({
        id: z.string(),
        entity: z.string(),
        status: z.enum(["applied", "stale", "rejected"]),
        reason: z.string().optional(),
        server: z.record(z.unknown()).optional(),
      }),
    )
    .default([]),
  pull: z.object(nodeSets).default({}),
  documents: z.array(WireDocumentSchema).default([]),
  hasMore: z.boolean().default(false),
});

export const WireDownloadUrlsSchema = z.object({
  expiresAt: z.string(),
  files: z.array(
    z.object({
      documentId: z.string(),
      title: z.string().default(""),
      kind: z.enum(["pdf", "parseBundle"]),
      url: z.string(),
      sizeBytes: z.number().default(0),
      checksumSha256: z.string().nullable().default(null),
      parseVersion: z.number().optional(),
    }),
  ),
});

export type WirePresenter = z.infer<typeof WirePresenterSchema>;
export type WireDocument = z.infer<typeof WireDocumentSchema>;
export type WireBootstrap = z.infer<typeof WireBootstrapSchema>;
export type WireSyncResponse = z.infer<typeof WireSyncResponseSchema>;
export type WireDownloadUrls = z.infer<typeof WireDownloadUrlsSchema>;
