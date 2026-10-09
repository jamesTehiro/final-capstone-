const router = require("express").Router();
const alumniRecordController = require("../controllers/alumniRecordController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const adminScopeMiddleware = require("../middleware/adminScopeMiddleware");

router.use(authMiddleware);
router.use(roleMiddleware("admin"));
router.use(adminScopeMiddleware("registrar"));

router.get("/", alumniRecordController.getAlumniRecords);
router.get("/search", alumniRecordController.searchAlumniRecords);
router.post("/", alumniRecordController.createAlumniRecord);
router.delete("/:id", alumniRecordController.deleteAlumniRecord);

module.exports = router;
