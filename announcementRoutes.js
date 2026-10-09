const router = require("express").Router();
const announcementController = require("../controllers/announcementController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const adminScopeMiddleware = require("../middleware/adminScopeMiddleware");

router.get("/", announcementController.getAnnouncements);
router.post("/", authMiddleware, roleMiddleware("admin"), adminScopeMiddleware("alumni"), announcementController.createAnnouncement);

module.exports = router;
