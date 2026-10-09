// middleware/roleMiddleware.js

module.exports = (roles = []) => {
    if (typeof roles === 'string') roles = [roles];

    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ msg: "Unauthorized" });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ msg: "Access denied" });
        }
        next();
    };
};
