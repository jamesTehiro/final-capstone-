const router = require("express").Router();
const chatController = require("../controllers/chatController");
const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

router.get("/users", chatController.searchUsers);
router.get("/conversations", chatController.getConversations);
router.post("/conversation", chatController.createConversation);
router.post("/message", chatController.sendMessage);
router.get("/messages/:conversation_id", chatController.getMessages);
router.delete("/conversation/:id", chatController.deleteConversation);

module.exports = router;
