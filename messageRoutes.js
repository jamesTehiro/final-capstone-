const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const messageController = require("../controllers/messageController");
const { chatAttachmentUpload } = require("../middleware/uploadMiddleware");

router.use(auth);

router.get("/conversations", messageController.getAccessibleConversations);
router.get("/search-users", messageController.searchEligibleUsers);
router.post("/direct", messageController.createOrGetDirectConversation);
router.get("/global", (req, res, next) => {
    req.params.room = "global";
    return messageController.getLegacyRoomMessages(req, res, next);
});
router.get("/employer", (req, res, next) => {
    req.params.room = "employer";
    return messageController.getLegacyRoomMessages(req, res, next);
});
router.get("/batch/:year", (req, res, next) => {
    req.params.room = "batch";
    return messageController.getLegacyRoomMessages(req, res, next);
});
router.get("/course", (req, res, next) => {
    req.params.room = "course";
    return messageController.getLegacyRoomMessages(req, res, next);
});
router.get("/files/:fileName", messageController.downloadMessageFile);
router.get("/:conversationId", messageController.getConversationMessages);
router.post("/", messageController.sendLegacyRoomMessage);
router.post("/:conversationId/read", messageController.markConversationAsRead);
router.post("/:conversationId", chatAttachmentUpload, messageController.sendConversationMessage);
router.delete("/:conversationId/messages/:messageId", messageController.deleteMessage);

module.exports = router;
