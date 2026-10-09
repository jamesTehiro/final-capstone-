const router = require("express").Router();
const profileController = require("../controllers/profileController");
const profilePreviewController = require("../controllers/profilePreviewController");
const authMiddleware = require("../middleware/authMiddleware");
const { optionalProfileUpload } = require("../middleware/uploadMiddleware");

router.use(authMiddleware);

router.get("/", profileController.getProfile);
router.get("/:userId/preview", profilePreviewController.getProfilePreview);
router.get("/:userId", profileController.getUserProfileById);
router.put("/", optionalProfileUpload, profileController.updateProfile);

module.exports = router;
