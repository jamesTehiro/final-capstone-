const router = require("express").Router();
const notificationController = require("../controllers/notificationController");
const authMiddleware = require("../middleware/authMiddleware");

// All routes require authentication
router.use(authMiddleware);

// GET all notifications for the logged-in user
router.get("/", notificationController.getUserNotifications);
router.get("/:id/interview", notificationController.getNotificationInterview);

// PUT to mark a notification as read
router.put("/read/:id", notificationController.markAsRead);
router.delete("/:id", notificationController.deleteNotification);

module.exports = router;
