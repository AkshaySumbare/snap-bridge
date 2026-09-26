import { z } from "zod";

/**
 * Validation for the sync payload.
 *
 * Strict about ids and timestamps and permissive about the rest, on purpose:
 * an id or a clock the server cannot trust breaks conflict resolution for
 * everybody, whereas an unexpected extra field is ignored by the write layer
 * anyway (only a collection's declared `mutableFields` are ever written).
 *
 * Note what is NOT accepted from a client: `firmId`, `presenterId`, `serverUpdatedAt`,
 * `createdBy`. Tenancy and server time come from the token and the clock.
 */

const ULID = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "id must be a ULID generated on the client");

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "must be an ObjectId");

const baseNode = z.object({
  _id: ULID,
  lastModifiedAt: z.union([z.string().datetime(), z.number()]),
  isDeleted: z.boolean().optional(),
  version: z.number().int().nonnegative().optional(),
});

const color = z.enum(["red", "green", "blue", "yellow", "magenta", "cyan", "clear"]);


const wrapperNode = baseNode.extend({
  title: z.string().max(500).optional(),
  order: z.number().int().optional(),
});

const cardNode = baseNode.extend({
  kind: z.enum(["note", "excerpt"]).optional(),
  wrapperId: ULID.nullable().optional(),
  order: z.number().int().optional(),
  title: z.string().max(1000).optional(),
  text: z.string().max(20000).optional(),
  color: color.optional(),
  placement: z.enum(["margin", "canvas"]).optional(),
  documentId: objectId.nullable().optional(),
  pageNumber: z.number().int().min(1).nullable().optional(),
  highlightId: ULID.nullable().optional(),
});

const linkNode = baseNode.extend({
  cardId: ULID.optional(),
  label: z.string().max(500).optional(),
  documentIds: z.array(objectId).max(50).optional(),
  order: z.number().int().optional(),
});

const connectionNode = baseNode.extend({
  cardId: ULID.optional(),
  linkId: ULID.nullable().optional(),
  documentId: objectId.optional(),
  pageNumber: z.number().int().min(1).optional(),
  paragraphId: z.string().max(300).optional(),
  parseVersion: z.number().int().min(1).optional(),
  ratioX: z.number().min(0).max(1).optional(),
  ratioY: z.number().min(0).max(1).optional(),
});

const highlightNode = baseNode.extend({
  documentId: objectId.optional(),
  pageNumber: z.number().int().min(1).optional(),
  paragraphId: z.string().max(300).optional(),
  parseVersion: z.number().int().min(1).optional(),
  start: z.number().int().min(0).optional(),
  end: z.number().int().min(0).optional(),
  color: color.optional(),
  text: z.string().max(5000).optional(),
  visibility: z.enum(["shared", "private"]).optional(),
});

export const syncRequestSchema = z.object({
  /** Present for symmetry; the route's `:presenterId` is what is trusted. */
  presenterId: objectId.optional(),
  deviceId: z.string().max(100).optional(),
  /**
   * What time the device thought it was when it built this batch.
   *
   * Only its offset from our clock is used, and that offset is applied to every
   * `lastModifiedAt` in the batch. Without it a tablet running fast wins every
   * conflict until its clock catches up, and one running slow has its work
   * silently overwritten by edits made before it.
   */
  deviceNow: z.union([z.string().datetime(), z.number()]).optional(),
  batchId: ULID.optional(),
  /**
   * The `cursor` from the previous sync — a per-case sequence number, not a
   * timestamp. Absent or null means "send me everything".
   */
  since: z.union([z.string(), z.number()]).nullable().optional(),
  changes: z
    .object({
      wrappers: z.array(wrapperNode).optional(),
      cards: z.array(cardNode).optional(),
      links: z.array(linkNode).optional(),
      connections: z.array(connectionNode).optional(),
      highlights: z.array(highlightNode).optional(),
    })
    .optional(),
});

export const createPresenterSchema = z.object({
  name: z.string().min(1).max(300),
  client: z.string().max(300).optional(),
  accent: z.enum(["red", "green", "blue", "yellow", "magenta", "cyan"]).optional(),
});

export const updatePresenterSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  client: z.string().max(300).optional(),
  accent: z.enum(["red", "green", "blue", "yellow", "magenta", "cyan"]).optional(),
});

export const inviteSchema = z.object({
  email: z.string().email(),
});

export const sharePresenterSchema = z.object({
  userIds: z.array(objectId).max(50),
});

export const updateDocumentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  folderId: ULID.nullable().optional(),
  order: z.number().int().optional(),
});

export type SyncRequestBody = z.infer<typeof syncRequestSchema>;
