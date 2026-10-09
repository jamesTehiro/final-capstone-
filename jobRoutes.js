const router = require("express").Router();
const jobController = require("../controllers/jobController");
const requirementController = require("../controllers/requirementController");
const authMiddleware = require("../middleware/authMiddleware");
const optionalAuthMiddleware = require("../middleware/optionalAuthMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const employerAccess = require("../middleware/employerAccess");

// Requirement Library (public, no auth needed for reading)
router.get("/requirements/library", optionalAuthMiddleware, requirementController.getLibrary);
router.get("/requirements/library/:code", optionalAuthMiddleware, requirementController.getLibraryByCode);

// Job CRUD
router.get("/", optionalAuthMiddleware, jobController.getJobs);
router.get("/:id", optionalAuthMiddleware, jobController.getJobById);

// Employer or Employer Admin only
router.post("/", authMiddleware, employerAccess, jobController.createJob);
router.put("/:id", authMiddleware, employerAccess, jobController.updateJob);
router.delete("/:id", authMiddleware, employerAccess, jobController.deleteJob);

// Recruitment lifecycle
router.post("/:id/stop-recruitment", authMiddleware, employerAccess, jobController.stopRecruitment);
router.post("/:id/reactivate-recruitment", authMiddleware, employerAccess, jobController.reactivateRecruitment);

// Job requirements (employer or authenticated)
router.get("/:id/requirements", optionalAuthMiddleware, jobController.getJobRequirements);
router.get("/:id/requirements/versions", authMiddleware, jobController.getRequirementVersions);
router.get("/:id/preview", authMiddleware, jobController.getJobPreview);

module.exports = router;