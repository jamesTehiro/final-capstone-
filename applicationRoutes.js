const router = require("express").Router();
const applicationController = require("../controllers/applicationController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const employerAccess = require("../middleware/employerAccess");
const { applicationUpload } = require("../middleware/uploadMiddleware");

router.use(authMiddleware);

router.post("/", roleMiddleware("alumni"), applicationUpload, applicationController.applyJob);
router.get("/", roleMiddleware("alumni"), applicationController.getApplications);
router.get("/employer", employerAccess, applicationController.getEmployerApplications);
router.get("/jobs/:jobId/applicants", authMiddleware, applicationController.getJobApplicants);

// Requirement review endpoints
router.put("/:id/review", employerAccess, applicationController.reviewApplication);
router.put("/:id/requirements/:code/review", employerAccess, applicationController.reviewRequirement);
router.get("/:id/requirements/review-status", applicationController.getRequirementReviewStatus);

// ZIP download
router.get("/:id/documents/download", applicationController.downloadApplicationDocuments);

module.exports = router;