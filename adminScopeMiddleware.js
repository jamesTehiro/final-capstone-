module.exports = (allowedScopes = []) => {
    const scopes = Array.isArray(allowedScopes) ? allowedScopes : [allowedScopes];

    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ msg: "Unauthorized" });
        }

        const currentScope = req.user?.admin_scope || "alumni";

        if (!scopes.includes(currentScope)) {
            return res.status(403).json({ msg: "Admin scope access denied." });
        }

        next();
    };
};
