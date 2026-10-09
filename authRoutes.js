// routes/authRoutes.js
const router = require("express").Router();
const authController = require("../controllers/authController");
const { registrationUpload } = require("../middleware/uploadMiddleware");
const bootstrapGuard = require("../middleware/bootstrapGuard");

router.post("/register", registrationUpload, authController.register);
router.post("/login", authController.login);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.get("/admin-setup-status", bootstrapGuard, authController.getAdminSetupStatus);
router.post("/admin-setup", bootstrapGuard, authController.setupAdmin);

module.exports = router;
