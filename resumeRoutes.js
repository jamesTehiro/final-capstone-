const express = require("express");
const router = express.Router();
const resumeController = require("../controllers/resumeController");
const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

router.get("/", resumeController.getResumes);
router.get("/:id", resumeController.getResume);
router.post("/", resumeController.createResume);
router.put("/:id", resumeController.updateResume);
router.delete("/:id", resumeController.deleteResume);
router.post("/:id/duplicate", resumeController.duplicateResume);
router.get("/:id/versions", resumeController.getVersions);
router.post("/:id/snapshot", resumeController.createSnapshot);
router.get("/:id/pdf", resumeController.getResumePdf);

module.exports = router;