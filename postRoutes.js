const router = require("express").Router();
const postController = require("../controllers/postController");
const authMiddleware = require("../middleware/authMiddleware");

router.get("/", postController.getPosts);
router.post("/", authMiddleware, postController.createPost);
router.get("/:postId/comments", postController.getPostComments);
router.post("/:postId/comments", authMiddleware, postController.addPostComment);
router.put("/:postId", authMiddleware, postController.updatePost);
router.delete("/:postId", authMiddleware, postController.deletePost);

module.exports = router;
