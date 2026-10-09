const router = require("express").Router();
const adminController = require("../controllers/adminController");
const jobController = require("../controllers/jobController");
const applicationController = require("../controllers/applicationController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const adminScopeMiddleware = require("../middleware/adminScopeMiddleware");

router.use(authMiddleware);
router.use(roleMiddleware("admin"));

// Alumni Admin routes
router.get("/alumni/users", adminScopeMiddleware("alumni"), adminController.getAlumniUsers);
router.put("/alumni/users/:userId/status", adminScopeMiddleware("alumni"), adminController.updateAlumniUserStatus);
router.post("/alumni/warnings", adminScopeMiddleware("alumni"), adminController.createAlumniWarning);
router.post("/alumni/announcements", adminScopeMiddleware("alumni"), adminController.createAlumniAnnouncement);
router.get("/alumni/announcements", adminScopeMiddleware("alumni"), adminController.getAnnouncements);
router.delete("/alumni/announcements/:id", adminScopeMiddleware("alumni"), adminController.deleteAnnouncement);

// Employer Admin routes
// Job management reuses the shared jobController / applicationController so there
// is a single source of truth for job posting, application review, interviews,
// hiring, notifications, and dynamic application requirements.
router.get("/employer/users", adminScopeMiddleware("employer"), adminController.getEmployerUsers);
router.put("/employer/users/:userId/status", adminScopeMiddleware("employer"), adminController.updateEmployerUserStatus);
router.post("/employer/warnings", adminScopeMiddleware("employer"), adminController.createEmployerWarning);
// Admin employer jobs are already guarded by adminScopeMiddleware("employer") above,
// so they intentionally reuse the shared jobController without employerAccess.
router.get("/employer/jobs", adminScopeMiddleware("employer"), jobController.getJobs);
router.get("/employer/applications", adminScopeMiddleware("employer"), applicationController.getEmployerApplications);
router.post("/employer/jobs", adminScopeMiddleware("employer"), jobController.createJob);
router.put("/employer/jobs/:jobId/approval", adminScopeMiddleware("employer"), adminController.updateJobApprovalStatus);
router.delete("/employer/jobs/:jobId", adminScopeMiddleware("employer"), adminController.deleteEmployerJob);
router.post(
    "/employer/jobs/:jobId/stop-recruitment",
    (req, res, next) => {
        console.log("=== ADMIN EMPLOYER STOP RECRUITMENT ROUTE HIT ===");
        console.log("Route matched: POST /api/admin/employer/jobs/:jobId/stop-recruitment");
        console.log("req.originalUrl:", req.originalUrl);
        console.log("req.params:", JSON.stringify(req.params));
        console.log("req.user:", JSON.stringify({ id: req.user?.id, role: req.user?.role, admin_scope: req.user?.admin_scope }));
        next();
    },
    adminScopeMiddleware("employer"),
    jobController.stopRecruitment
);
router.post("/employer/jobs/:jobId/reactivate-recruitment", adminScopeMiddleware("employer"), jobController.reactivateRecruitment);
router.put("/employer/applications/:applicationId/review", adminScopeMiddleware("employer"), applicationController.reviewApplication);

module.exports = router;

