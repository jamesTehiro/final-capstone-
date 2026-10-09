const router = require("express").Router();
const registrarController = require("../controllers/registrarController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const adminScopeMiddleware = require("../middleware/adminScopeMiddleware");

router.use(authMiddleware);
router.use(roleMiddleware("admin"));
router.use(adminScopeMiddleware("registrar"));

router.get("/pending", registrarController.getPendingAlumniUsers);
router.put("/:id/approve", registrarController.approveAlumniUser);
router.put("/:id/reject", registrarController.rejectAlumniUser);

module.exports = router;
