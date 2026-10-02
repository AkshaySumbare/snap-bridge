import express, { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { presenterScope, requirePresenterOwner } from "../middleware/presenterScope.js";
import * as controller from "../controllers/presenter.controller.js";

/**
 * Presenter API — a standalone reading workspace.
 *
 * Static paths (`/create`, `/users`, `/invites/...`) are registered before
 * `/:presenterId` so they are never treated as ids.
 */

const { asyncHandler } = controller;
const router: Router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

router.use(requireAuth);

router.get("/", asyncHandler(controller.listPresenters));
router.get("/list", asyncHandler(controller.listPresenters));
router.post("/create", asyncHandler(controller.createPresenter));
router.get("/users", asyncHandler(controller.searchUsers));
router.post("/invites/:token/accept", asyncHandler(controller.acceptInvite));

router.patch("/:presenterId", presenterScope, asyncHandler(controller.patchPresenter));
router.delete(
  "/:presenterId",
  presenterScope,
  requirePresenterOwner,
  asyncHandler(controller.removePresenter),
);

router.put(
  "/:presenterId/share",
  presenterScope,
  requirePresenterOwner,
  asyncHandler(controller.sharePresenter),
);
router.delete(
  "/:presenterId/share/:userId",
  presenterScope,
  requirePresenterOwner,
  asyncHandler(controller.unsharePresenter),
);
router.get(
  "/:presenterId/collaborators",
  presenterScope,
  asyncHandler(controller.listCollaborators),
);
router.post(
  "/:presenterId/invites",
  presenterScope,
  requirePresenterOwner,
  asyncHandler(controller.inviteCollaborator),
);
router.delete(
  "/:presenterId/invites/:inviteId",
  presenterScope,
  requirePresenterOwner,
  asyncHandler(controller.revokeInvite),
);

router.get("/:presenterId/bootstrap", presenterScope, asyncHandler(controller.bootstrap));

router.post("/:presenterId/sync", presenterScope, asyncHandler(controller.sync));
router.get("/:presenterId/sync", presenterScope, asyncHandler(controller.pull));

router.get("/:presenterId/documents", presenterScope, asyncHandler(controller.listPresenterDocuments));
router.post(
  "/:presenterId/documents",
  presenterScope,
  upload.single("file"),
  asyncHandler(controller.uploadDocument),
);
router.patch(
  "/:presenterId/documents/:documentId",
  presenterScope,
  asyncHandler(controller.patchDocument),
);
router.delete(
  "/:presenterId/documents/:documentId",
  presenterScope,
  asyncHandler(controller.removeDocument),
);
router.get(
  "/:presenterId/documents/:documentId/pages",
  presenterScope,
  asyncHandler(controller.documentPages),
);
router.get(
  "/:presenterId/documents/:documentId/parse-status",
  presenterScope,
  asyncHandler(controller.parseStatus),
);
router.post(
  "/:presenterId/documents/:documentId/parse",
  presenterScope,
  asyncHandler(controller.retryParse),
);

router.get(
  "/:presenterId/offline-manifest",
  presenterScope,
  asyncHandler(controller.offlineManifest),
);
router.get("/:presenterId/download-urls", presenterScope, asyncHandler(controller.downloadUrls));

router.get("/:presenterId/search", presenterScope, asyncHandler(controller.search));

router.use(controller.presenterErrorHandler);

export default router;
