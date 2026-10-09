const router = require("express").Router();
const commentController = require("../controllers/commentController");
const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

// Create a comment
router.post("/", commentController.createComment);

// Get comments for a specific announcement
router.get("/:announcement_id", commentController.getCommentsByAnnouncement);

module.exports = router;