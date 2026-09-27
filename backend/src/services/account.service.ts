import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { getRedis } from "../db/redis.js";
import { User } from "../models/User.js";
import { Folder } from "../models/vault/Folder.js";
import { VaultDocument } from "../models/vault/Document.js";
import { DocumentChunk } from "../models/vault/DocumentChunk.js";
import Presenter from "../models/presenter/presenter.model.js";
import { PresenterInvite } from "../models/presenter/presenterInvite.model.js";
import { deleteAsset, type CloudinaryResourceType } from "./cloudinary.service.js";
import { purgePresenter } from "./presenter/presenter.service.js";
import { ENTITIES, ENTITY_ORDER } from "./presenter/registry.js";
import { revokeAllUserTokens } from "./token.service.js";
import { AppError } from "../utils/errors.js";

const OTP_PREFIX = "email-otp:";
const OTP_RESEND_PREFIX = "email-otp-resend:";

export interface DeleteAccountSummary {
  userId: string;
  presentersPurged: number;
  vaultDocumentsDeleted: number;
  vaultFoldersDeleted: number;
  presenterNodesDeleted: number;
  sharedMembershipsRemoved: number;
  invitesRemoved: number;
}

async function clearUserRedisKeys(userId: string): Promise<void> {
  const redis = getRedis();
  await redis.del([`${OTP_PREFIX}${userId}`, `${OTP_RESEND_PREFIX}${userId}`]);
  await revokeAllUserTokens(userId);
}

async function purgeVaultForUser(userId: string): Promise<{ documents: number; folders: number }> {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const docs = await VaultDocument.find({ userId: userObjectId }).lean();

  for (const doc of docs) {
    await DocumentChunk.deleteMany({ documentId: doc._id });
    try {
      await deleteAsset(doc.cloudinaryPublicId, doc.resourceType as CloudinaryResourceType);
    } catch (error) {
      console.warn(`[account] vault asset delete failed ${doc.cloudinaryPublicId}:`, error);
    }
  }

  const docResult = await VaultDocument.deleteMany({ userId: userObjectId });
  await DocumentChunk.deleteMany({ userId: userObjectId });
  const folderResult = await Folder.deleteMany({ userId: userObjectId });

  return {
    documents: docResult.deletedCount ?? 0,
    folders: folderResult.deletedCount ?? 0,
  };
}

async function purgeOwnedPresenters(userId: string): Promise<number> {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const owned = await Presenter.find({ createdBy: userObjectId, isDeleted: false })
    .select("_id")
    .lean();

  for (const row of owned) {
    const presenterId = row._id as mongoose.Types.ObjectId;
    await PresenterInvite.deleteMany({ presenterId });
    await purgePresenter(presenterId);
  }

  return owned.length;
}

async function removeSharedMemberships(userId: string): Promise<number> {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const result = await Presenter.updateMany(
    { sharedWith: userObjectId },
    { $pull: { sharedWith: userObjectId }, $addToSet: { formerMembers: userObjectId } },
  );
  return result.modifiedCount ?? 0;
}

async function deleteCollaboratorNodes(userId: string): Promise<number> {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  let total = 0;
  for (const entity of ENTITY_ORDER) {
    const result = await ENTITIES[entity].model.deleteMany({ createdBy: userObjectId });
    total += result.deletedCount ?? 0;
  }
  return total;
}

async function removePresenterInvites(userId: string, email: string): Promise<number> {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const normalized = email.trim().toLowerCase();
  const result = await PresenterInvite.deleteMany({
    $or: [{ invitedBy: userObjectId }, { acceptedBy: userObjectId }, { email: normalized }],
  });
  return result.deletedCount ?? 0;
}

async function removeAvatar(user: InstanceType<typeof User>): Promise<void> {
  if (!user.avatarPublicId) return;
  try {
    await deleteAsset(user.avatarPublicId, "image");
  } catch (error) {
    console.warn(`[account] avatar delete failed for ${user._id}:`, error);
  }
}

/**
 * Permanently delete the signed-in user and all data tied to them.
 *
 * Owned Presenter workspaces are fully purged (PDFs, pages, annotations).
 * Vault documents, folders, chunks, and Cloudinary uploads are removed.
 * Membership on others' presenters is revoked; annotations they created
 * elsewhere are deleted. Sessions and verification OTP keys are cleared.
 */
export async function deleteUserAccount(
  userId: string,
  options: { password?: string },
): Promise<DeleteAccountSummary> {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, "User not found");
  }

  if (user.authProvider === "local") {
    if (!options.password?.trim()) {
      throw new AppError(400, "Password is required to delete your account");
    }
    if (!user.passwordHash || !(await bcrypt.compare(options.password, user.passwordHash))) {
      throw new AppError(403, "Incorrect password");
    }
  }

  await clearUserRedisKeys(userId);

  const vault = await purgeVaultForUser(userId);
  const presentersPurged = await purgeOwnedPresenters(userId);
  const sharedMembershipsRemoved = await removeSharedMemberships(userId);
  const presenterNodesDeleted = await deleteCollaboratorNodes(userId);
  const invitesRemoved = await removePresenterInvites(userId, user.email);

  await removeAvatar(user);
  await User.deleteOne({ _id: user._id });

  const summary: DeleteAccountSummary = {
    userId,
    presentersPurged,
    vaultDocumentsDeleted: vault.documents,
    vaultFoldersDeleted: vault.folders,
    presenterNodesDeleted,
    sharedMembershipsRemoved,
    invitesRemoved,
  };

  console.info("[account] deleted user", summary);
  return summary;
}
