// middleware/employerAccess.js
// Allows role=employer OR role=admin with admin_scope=employer
// This preserves the existing role hierarchy while granting
// Employer Administrators the same access as verified employers.

module.exports = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ msg: "Unauthorized" });
    }

    // Direct employer access
    if (req.user.role === "employer") {
        return next();
    }

    // Employer Admin access (admin with employer scope)
    if (req.user.role === "admin" && req.user.admin_scope === "employer") {
        return next();
    }

    return res.status(403).json({ msg: "Access denied. Employer or Employer Admin access required." });
};