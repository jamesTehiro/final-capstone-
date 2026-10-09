const router = require("express").Router();
const authMiddleware = require("../middleware/authMiddleware");
const adminEmployerMessageController = require("../controllers/adminEmployerMessageController");
const { adminEmployerAttachmentUpload } = require("../middleware/uploadMiddleware");

const allowEmployerOrEmployerAdmin = (req, res, next) => {
    const isEmployer = req.user?.role === "employer";
    const isEmployerAdmin = req.user?.role === "admin" && req.user?.admin_scope === "employer";

    if (!isEmployer && !isEmployerAdmin) {
        return res.status(403).json({ msg: "Employer or Employer Admin access only." });
    }

    return next();
};

router.use(authMiddleware);
router.use(allowEmployerOrEmployerAdmin);

router.get(
    "/conversations",
    adminEmployerMessageController.listEmployerConversations
);
router.post(
    "/messages",
    adminEmployerAttachmentUpload,
    adminEmployerMessageController.sendEmployerMessage
);
router.get(
    "/messages/:employerId",
    adminEmployerMessageController.getEmployerMessages
);
router.delete(
    "/messages/:employerId/:messageId",
    adminEmployerMessageController.deleteEmployerMessage
);
router.get(
    "/messages/files/:fileName",
    adminEmployerMessageController.downloadEmployerMessageAttachment
);

module.exports = router;
