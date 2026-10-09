const db = require("../models");
const REQUIRED_ADMIN_SCOPES = ["registrar", "employer", "alumni"];

const getProvidedSecret = (req) =>
    req.headers["x-bootstrap-secret"] ||
    req.body?.bootstrap_secret ||
    req.query?.bootstrap_secret ||
    "";

module.exports = async (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || "unknown";
    const secret = String(getProvidedSecret(req) || "").trim();
    const configuredSecret = String(process.env.ADMIN_BOOTSTRAP_SECRET || "").trim();

    // eslint-disable-next-line no-console
    console.warn(
        `[bootstrap-attempt] ${new Date().toISOString()} ${req.method} ${req.originalUrl} ip=${ip}`
    );

    if (!configuredSecret) {
        return res.status(503).json({ msg: "Admin bootstrap is not configured." });
    }

    const admins = await db.User.findAll({
        where: { role: "admin" },
        attributes: ["admin_scope"]
    });
    const existingScopes = new Set(
        admins
            .map((admin) => String(admin.admin_scope || "").trim().toLowerCase())
            .filter(Boolean)
    );
    const allAdminScopesConfigured = REQUIRED_ADMIN_SCOPES.every((scope) => existingScopes.has(scope));

    if (req.method === "GET" && allAdminScopesConfigured) {
        return next();
    }

    if (!secret || secret !== configuredSecret) {
        return res.status(403).json({ msg: "Invalid bootstrap secret." });
    }

    if (allAdminScopesConfigured) {
        return res.status(403).json({ msg: "Admin bootstrap is already locked." });
    }

    return next();
};
