import crypto from "node:crypto";
import mongoose from "mongoose";
import { PresenterInvite } from "../../models/presenter/presenterInvite.model.js";
import { User } from "../../models/User.js";
import Presenter from "../../models/presenter/presenter.model.js";
import { setSharedWith } from "./presenter.service.js";
import { sendPresenterInviteEmail } from "../email.service.js";
import { config } from "../../config.js";

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
    const current = await Presenter.findById(presenterId, { sharedWith: 1, createdBy: 1 }).lean();
    const next = [...(current?.sharedWith ?? []).map(String), String(existingUser._id)];
    const updated = await setSharedWith(
      presenterId,
      ownerId,
      next.map((id) => new mongoose.Types.ObjectId(id)),
    );
    return { kind: "member" as const, presenter: updated, user: publicUser(existingUser) };
  }

  const token = crypto.randomBytes(24).toString("hex");
  await PresenterInvite.updateMany(
    { presenterId, email: normalized, status: "pending" },
    { $set: { status: "revoked" } },
  );
  const invite = await PresenterInvite.create({
    presenterId,
    email: normalized,
    token,
    invitedBy: ownerId,
    status: "pending",
  });

  const presenterRow = await Presenter.findById(presenterId, { name: 1 }).lean();
  const acceptUrl = `${config.frontendUrl}/presenter/invite/${token}`;
  await sendPresenterInviteEmail(normalized, presenterRow?.name ?? "a Presenter", acceptUrl);
  return {
    kind: "invite" as const,
    invite: { id: String(invite._id), email: invite.email, status: invite.status },
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
