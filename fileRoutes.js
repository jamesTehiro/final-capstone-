const router = require("express").Router();
const authMiddleware = require("../middleware/authMiddleware");
const fileController = require("../controllers/fileController");

router.use(authMiddleware);
router.get("/secure/:token", fileController.getSecureStoredFile);
router.get("/:folder/:fileName", fileController.getSecureFile);

module.exports = router;
