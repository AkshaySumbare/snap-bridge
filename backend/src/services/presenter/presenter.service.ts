import mongoose from "mongoose";

import Presenter from "../../models/presenter/presenter.model.js";
import PresenterDocument from "../../models/presenter/presenterDocument.model.js";
import PresenterPage from "../../models/presenter/presenterPage.model.js";
import { PresenterHighlight } from "../../models/presenter/presenterNodes.model.js";
import { ENTITIES, ENTITY_ORDER } from "./registry.js";
import { presenterBlobPrefix, deleteBlobsByPrefix } from "./blob.js";

/**
 * Presenter's own cases — the folders on the landing screen.
 *
 * A reader lands here, makes a folder, drops PDFs in it and starts working.
 * There is no matter to create first and no team to be assigned to: this is a
 * reading workspace, not a case-management record.
 */

const ACCENTS = ["blue", "green", "yellow", "magenta", "cyan", "red"] as const;

/**
 * The shape every case endpoint returns.
 *
 * One mapper for list, create and patch: a client that has to tell `_id` from
 * `id` depending on which call it made is a client that will get it wrong.
 */
export const toPresenterDto = (
  entry: {
    _id: unknown;
    name: string;
    client: string;
    accent: string;
    createdBy: unknown;
    sharedWith?: unknown[];
    lastModifiedAt: Date;
    documentCount?: number;
    excerptCount?: number;
  },
  viewerId: unknown,
) => ({
  id: String(entry._id),
  name: entry.name,
  client: entry.client,
  accent: entry.accent,
  updatedAt: entry.lastModifiedAt,
  isOwner: String(entry.createdBy) === String(viewerId),
  sharedWith: (entry.sharedWith ?? []).map(String),
  documentCount: entry.documentCount ?? 0,
  excerptCount: entry.excerptCount ?? 0,
});

/** Cases this user can open: their own, plus any shared with them. */
export const visibleTo = (userId: mongoose.Types.ObjectId) => ({
  isDeleted: false,
  $or: [{ createdBy: userId }, { sharedWith: userId }],
});

export const listPresenters = async (
  _firmId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
) => {
  const cases = await Presenter.find(visibleTo(userId))
    .sort({ lastModifiedAt: -1 })
    .limit(200)
    .lean();

  return cases.map((entry) => toPresenterDto(entry, userId));
};

/** Move a tile's numbers. A no-op delta is not worth a write. */
export const bumpPresenterCounts = async (
  presenterId: mongoose.Types.ObjectId,
  delta: { documentCount?: number; excerptCount?: number },
): Promise<void> => {
  const inc = Object.fromEntries(
    Object.entries(delta).filter(([, value]) => typeof value === "number" && value !== 0),
  );
  if (Object.keys(inc).length === 0) return;
  await Presenter.updateOne({ _id: presenterId }, { $inc: inc });
};

/**
 * Recompute a case's counters from the rows themselves.
 *
 * The reconciliation path. Maintained counters can drift — a process dying
 * between a write and its `$inc`, a bulk operation that bypassed the normal
 * route — and a tile that lies quietly is worse than one that is slow. Cheap
 * enough to run from a job, or after any bulk change.
 */
export const recountPresenter = async (presenterId: mongoose.Types.ObjectId) => {
  const [documentCount, excerptCount] = await Promise.all([
    PresenterDocument.countDocuments({ presenterId, isDeleted: false }),
    PresenterHighlight.countDocuments({ presenterId, isDeleted: false }),
  ]);
  return Presenter.findOneAndUpdate(
    { _id: presenterId },
    { $set: { documentCount, excerptCount } },
    { new: true },
  ).lean();
};

export const createPresenter = async (
  firmId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  input: { name: string; client?: string; accent?: string },
) => {
  // Cycle the tints so a new folder is distinguishable from the one before it
  // without asking the reader to pick a colour.
  const existing = await Presenter.countDocuments({ firmId, createdBy: userId, isDeleted: false });
  const now = new Date();
  const created = await Presenter.create({
    firmId,
    createdBy: userId,
    updatedBy: userId,
    name: input.name,
    client: input.client ?? "",
    accent: input.accent ?? ACCENTS[existing % ACCENTS.length],
    createdAt: now,
    lastModifiedAt: now,
    serverUpdatedAt: now,
  });
  return toPresenterDto(created.toObject(), userId);
};

export const updatePresenter = async (
  presenterId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  patch: { name?: string; client?: string; accent?: string },
) => {
  const now = new Date();
  const updated = await Presenter.findOneAndUpdate(
    { _id: presenterId, isDeleted: false },
    { $set: { ...patch, updatedBy: userId, lastModifiedAt: now, serverUpdatedAt: now }, $inc: { version: 1 } },
    { new: true },
  ).lean();
  return updated ? toPresenterDto(updated, userId) : null;
};

/**
 * Delete a case for good — every PDF, every parse bundle, every page, every
 * annotation, and the folder itself.
 *
 * Permanent by design. A reader deleting a case means the material should stop
 * existing: it is the only honest answer to a client asking for their
 * documents to be removed, and the only one that stops storage costs growing
 * forever.
 *
 * Blobs go first. If the process dies midway, what is left is a case whose
 * files are gone — visibly broken, and re-runnable. The reverse order would
 * leave orphaned blobs that nothing points at and nobody would ever find.
 *
 * Devices holding this case offline discover it through the 404 their next
 * sync gets; there is nothing to tombstone because there is no case left to
 * sync against.
 */
export const purgePresenter = async (
  presenterId: mongoose.Types.ObjectId,
): Promise<{ id: string; blobsDeleted: number; documentsDeleted: number; nodesDeleted: number }> => {
  const blobsDeleted = await deleteBlobsByPrefix(presenterBlobPrefix(String(presenterId)));

  const nodeResults = await Promise.all(
    ENTITY_ORDER.map((entity) => ENTITIES[entity].model.deleteMany({ presenterId })),
  );
  const nodesDeleted = nodeResults.reduce((total, result) => total + (result.deletedCount ?? 0), 0);

  const [, documents] = await Promise.all([
    PresenterPage.deleteMany({ presenterId }),
    PresenterDocument.deleteMany({ presenterId }),
  ]);

  /*
   * The row itself stays, as a tombstone of ids and nothing else — no name,
   * no client — so a member's device can be told the case was deleted (410)
   * rather than that it never existed (404). Everything the case held is gone.
   */
  const now = new Date();
  await Presenter.updateOne(
    { _id: presenterId },
    {
      $set: {
        isDeleted: true,
        deletedAt: now,
        name: "(deleted)",
        client: "",
        documentCount: 0,
        excerptCount: 0,
        seqPending: [],
        lastModifiedAt: now,
        serverUpdatedAt: now,
      },
    },
  );

  console.info(
    `[presenter] purged case ${presenterId}: ${blobsDeleted} blob(s), ` +
      `${documents.deletedCount} document(s), ${nodesDeleted} annotation node(s)`,
  );

  return {
    id: String(presenterId),
    blobsDeleted,
    documentsDeleted: documents.deletedCount ?? 0,
    nodesDeleted,
  };
};

/**
 * Let colleagues into a case.
 *
 * A flat list of user ids on the case, not a permission matrix: everyone let
 * in works the file the same way. Anything finer belongs to case-management,
 * which this feature deliberately does not touch.
 *
 * Only the owner may change it — otherwise a guest could quietly add others.
 */
export const setSharedWith = async (
  presenterId: mongoose.Types.ObjectId,
  ownerId: mongoose.Types.ObjectId,
  userIds: mongoose.Types.ObjectId[],
) => {
  const now = new Date();
  // The owner is never in the list: they are in by being the owner.
  const nextShared = userIds.filter((id) => String(id) !== String(ownerId));
  const current = await Presenter.findOne(
    { _id: presenterId, createdBy: ownerId, isDeleted: false },
    { sharedWith: 1, formerMembers: 1 },
  ).lean();
  if (!current) return null;
  // Whoever drops off the list becomes a former member; whoever is (re)added stops being one.
  const keep = new Set(nextShared.map(String));
  const formerMembers = [
    ...new Set([...(current.formerMembers ?? []), ...(current.sharedWith ?? [])].map(String)),
  ]
    .filter((id) => !keep.has(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const updated = await Presenter.findOneAndUpdate(
    { _id: presenterId, createdBy: ownerId, isDeleted: false },
    {
      $set: {
        sharedWith: nextShared,
        formerMembers,
        updatedBy: ownerId,
        lastModifiedAt: now,
        serverUpdatedAt: now,
      },
      $inc: { version: 1 },
    },
    { new: true },
  ).lean();
  return updated ? toPresenterDto(updated, ownerId) : null;
};

export const revokeShare = async (
  presenterId: mongoose.Types.ObjectId,
  ownerId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
) => {
  const now = new Date();
  const updated = await Presenter.findOneAndUpdate(
    { _id: presenterId, createdBy: ownerId, isDeleted: false },
    {
      $pull: { sharedWith: userId },
      $addToSet: { formerMembers: userId },
      $set: { updatedBy: ownerId, lastModifiedAt: now, serverUpdatedAt: now },
      $inc: { version: 1 },
    },
    { new: true },
  ).lean();
  return updated ? toPresenterDto(updated, ownerId) : null;
};
