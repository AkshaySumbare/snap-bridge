import crypto from "node:crypto";
import mongoose from "mongoose";
import { PresenterInvite } from "../../models/presenter/presenterInvite.model.js";
import { User } from "../../models/User.js";
import Presenter from "../../models/presenter/presenter.model.js";
import { setSharedWith } from "./presenter.service.js";
import { sendPresenterInviteEmail } from "../email.service.js";
import { config } from "../../config.js";
import { AppError } from "../../utils/errors.js";

function publicUser(user: { _id: unknown; email: string; name?: string | null; avatarUrl?: string | null }) {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name ?? null,
    avatarUrl: user.avatarUrl ?? null,
  };
}

export async function searchUsers(query: string, excludeId: mongoose.Types.ObjectId) {
  const needle = query.trim();
  if (needle.length < 1) {
    const users = await User.find({ _id: { $ne: excludeId } }).limit(50).lean();
    return users.map((user) => publicUser(user));
  }
  const users = await User.find({
    _id: { $ne: excludeId },
    $or: [
      { email: { $regex: needle, $options: "i" } },
      { name: { $regex: needle, $options: "i" } },
    ],
  })
    .limit(20)
    .lean();
  return users.map((user) => publicUser(user));
}

export async function revokePendingInvitesForEmail(
  presenterId: mongoose.Types.ObjectId,
  email: string,
): Promise<number> {
  const normalized = email.trim().toLowerCase();
  const result = await PresenterInvite.updateMany(
    { presenterId, email: normalized, status: "pending" },
    { $set: { status: "revoked" } },
  );
  return result.modifiedCount ?? 0;
}

export async function revokePendingInvite(
  presenterId: mongoose.Types.ObjectId,
  ownerId: mongoose.Types.ObjectId,
  inviteId: mongoose.Types.ObjectId,
) {
  const presenter = await Presenter.findById(presenterId, { createdBy: 1 }).lean();
  if (!presenter || String(presenter.createdBy) !== String(ownerId)) {
    throw new AppError(403, "Only the presenter owner can cancel invites.");
  }

  const invite = await PresenterInvite.findOne({
    _id: inviteId,
    presenterId,
    status: "pending",
  });
  if (!invite) {
    throw new AppError(404, "Pending invite not found.");
  }

  invite.status = "revoked";
  await invite.save();
  return { id: String(invite._id), email: invite.email };
}

export async function listCollaborators(presenterId: mongoose.Types.ObjectId) {
  const entry = await Presenter.findById(presenterId, { sharedWith: 1, createdBy: 1 }).lean();
  if (!entry) return { ownerId: null, members: [], invites: [] };

  const members = await User.find({ _id: { $in: entry.sharedWith ?? [] } }).lean();
  const invites = await PresenterInvite.find({ presenterId, status: "pending" }).lean();

  return {
    ownerId: String(entry.createdBy),
    members: members.map((user) => publicUser(user)),
    invites: invites.map((invite) => ({
      id: String(invite._id),
      email: invite.email,
      status: invite.status,
      createdAt: invite.createdAt,
    })),
  };
}

export async function inviteByEmail(
  presenterId: mongoose.Types.ObjectId,
  ownerId: mongoose.Types.ObjectId,
  email: string,
) {
  const normalized = email.trim().toLowerCase();
  const existingUser = await User.findOne({ email: normalized });
  if (existingUser) {
    if (String(existingUser._id) === String(ownerId)) {
      throw new AppError(400, "You already own this presenter.");
    }
    const current = await Presenter.findById(presenterId, { sharedWith: 1, createdBy: 1 }).lean();
    if (!current || String(current.createdBy) !== String(ownerId)) {
      throw new AppError(403, "Only the presenter owner can invite collaborators.");
    }
    const alreadyShared = (current.sharedWith ?? []).some(
      (id) => String(id) === String(existingUser._id),
    );
    if (alreadyShared) {
      return {
        kind: "member" as const,
        emailSent: null,
        message: `${normalized} already has access to this presenter.`,
        user: publicUser(existingUser),
      };
    }
    const next = [...(current.sharedWith ?? []).map(String), String(existingUser._id)];
    const updated = await setSharedWith(
      presenterId,
      ownerId,
      next.map((id) => new mongoose.Types.ObjectId(id)),
    );
    if (!updated) {
      throw new AppError(404, "Presenter not found or you are not the owner.");
    }
    await revokePendingInvitesForEmail(presenterId, normalized);
    return {
      kind: "member" as const,
      emailSent: null,
      message: `${normalized} has been granted access (they already have a SnapBridge account).`,
      user: publicUser(existingUser),
    };
  }

  const existingPending = await PresenterInvite.findOne({
    presenterId,
    email: normalized,
    status: "pending",
  });
  if (existingPending) {
    const acceptUrl = `${config.frontendUrl}/presenter/invite/${existingPending.token}`;
    return {
      kind: "invite" as const,
      invite: {
        id: String(existingPending._id),
        email: existingPending.email,
        status: existingPending.status,
      },
      emailSent: false,
      alreadyPending: true,
      acceptUrl,
      message: `An invite is already pending for ${normalized}. Cancel it below to send a new one, or share the existing link.`,
    };
  }

  const token = crypto.randomBytes(24).toString("hex");
  const invite = await PresenterInvite.create({
    presenterId,
    email: normalized,
    token,
    invitedBy: ownerId,
    status: "pending",
  });

  const presenterRow = await Presenter.findById(presenterId, { name: 1 }).lean();
  const acceptUrl = `${config.frontendUrl}/presenter/invite/${token}`;

  let emailSent = false;
  let message: string | undefined;
  let emailFailureReason: string | undefined;

  try {
    await sendPresenterInviteEmail(normalized, presenterRow?.name ?? "a Presenter", acceptUrl);
    emailSent = true;
  } catch (error) {
    emailFailureReason =
      error instanceof AppError
        ? error.message
        : "The invitation email could not be sent.";
    message = `Invite to ${normalized} was saved, but the email could not be sent. Share the invite link below instead.`;
    console.warn(`[invite] email to ${normalized} failed: ${emailFailureReason}`);
    if (config.isDev) {
      console.log(`[invite:dev] accept link: ${acceptUrl}`);
    }
  }

  return {
    kind: "invite" as const,
    invite: { id: String(invite._id), email: invite.email, status: invite.status },
    emailSent,
    acceptUrl: emailSent ? undefined : acceptUrl,
    message: emailSent ? undefined : message,
    emailFailureReason: emailSent ? undefined : emailFailureReason,
  };
}

export async function acceptInvite(token: string, userId: mongoose.Types.ObjectId) {
  const invite = await PresenterInvite.findOne({ token, status: "pending" });
  if (!invite) return null;
  const user = await User.findById(userId);
  if (!user || user.email.toLowerCase() !== invite.email) {
    throw new Error("INVITE_EMAIL_MISMATCH");
  }

  const current = await Presenter.findById(invite.presenterId, { sharedWith: 1, createdBy: 1 }).lean();
  if (!current) return null;
  const next = [...new Set([...(current.sharedWith ?? []).map(String), String(userId)])];
  await setSharedWith(
    invite.presenterId,
    current.createdBy,
    next.map((id) => new mongoose.Types.ObjectId(id)),
  );
  invite.status = "accepted";
  invite.acceptedBy = userId;
  await invite.save();
  return { presenterId: String(invite.presenterId) };
}
