import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { confirmAvatarSchema } from "../validators/profile.validator.js";
import * as profileService from "../services/profile.service.js";

const router = Router();

router.post(
  "/avatar/sign",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { auth } = req as AuthedRequest;
    const params = profileService.getAvatarUploadSignature(auth.userId);
    res.json(params);
  }),
);

router.post(
  "/avatar/confirm",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = confirmAvatarSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { auth } = req as AuthedRequest;
    const user = await profileService.confirmAvatarUpload(
      auth.userId,
      parsed.data.publicId,
      parsed.data.secureUrl,
    );

    res.json({ user, message: "Profile image updated" });
  }),
);

router.delete(
  "/avatar",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { auth } = req as AuthedRequest;
    const user = await profileService.deleteUserAvatar(auth.userId);
    res.json({ user, message: "Profile image removed" });
  }),
);

export default router;
