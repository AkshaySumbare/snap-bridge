import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import Presenter from "../models/presenter/presenter.model.js";
import type { AuthedRequest } from "./auth.js";

export interface PresenterScopedRequest extends Request {
  presenterId?: mongoose.Types.ObjectId;
  firmObjectId?: mongoose.Types.ObjectId;
  userObjectId?: mongoose.Types.ObjectId;
  isPresenterOwner?: boolean;
}

function viewerId(req: Request): string | undefined {
  return (req as AuthedRequest).auth?.userId;
}

export const presenterScope = async (
  req: PresenterScopedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const rawPresenterId = req.params.presenterId ?? (req.body?.presenterId as string);
  const userId = viewerId(req);

  if (!rawPresenterId || !mongoose.Types.ObjectId.isValid(rawPresenterId)) {
    res.status(400).json({ success: false, error: { code: "INVALID_PRESENTER_ID" } });
    return;
  }
  if (!userId) {
    res.status(401).json({ success: false, error: { code: "UNAUTHENTICATED" } });
    return;
  }

  const presenterId = new mongoose.Types.ObjectId(rawPresenterId);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const found = await Presenter.findOne(
    { _id: presenterId },
    { createdBy: 1, firmId: 1, sharedWith: 1, formerMembers: 1, isDeleted: 1 },
  ).lean();

  const includes = (list: unknown[] | undefined) =>
    (list ?? []).some((entry) => String(entry) === String(userId));
  const isOwner = Boolean(found) && String(found!.createdBy) === String(userId);
  const isMember = isOwner || includes(found?.sharedWith);
  const wasMember = isMember || includes(found?.formerMembers);

  if (!found || !wasMember) {
    res.status(404).json({ success: false, error: { code: "PRESENTER_NOT_FOUND" } });
    return;
  }
  if (found.isDeleted) {
    res.status(410).json({
      success: false,
      error: { code: "PRESENTER_DELETED", message: "This presenter has been deleted" },
    });
    return;
  }
  if (!isMember) {
    res.status(403).json({
      success: false,
      error: { code: "ACCESS_REVOKED", message: "You no longer have access to this presenter" },
    });
    return;
  }

  req.presenterId = presenterId;
  req.firmObjectId = found.firmId ?? found.createdBy;
  req.userObjectId = userObjectId;
  req.isPresenterOwner = isOwner;
  next();
};

export const requirePresenterOwner = (
  req: PresenterScopedRequest,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.isPresenterOwner) {
    res.status(403).json({
      success: false,
      error: { code: "NOT_PRESENTER_OWNER", message: "Only the owner can do this" },
    });
    return;
  }
  next();
};
