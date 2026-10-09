const jwt = require("jsonwebtoken");

const extractToken = (authorizationHeader = "") => {
    if (!authorizationHeader) return null;

    // Accept both "Bearer <token>" and raw tokens (for backwards compatibility)
    const parts = authorizationHeader.split(" ");
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
        return parts[1].trim();
    }

    return authorizationHeader.trim() || null;
};

module.exports = (req, res, next) => {
    const rawHeader = req.headers.authorization || req.headers.Authorization;
    const token = extractToken(rawHeader);

    if (!token) {
        return res.status(401).json({ msg: "No token provided" });
    }

    if (!process.env.JWT_SECRET) {
        return res.status(500).json({ msg: "JWT secret not configured" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        return next();
    } catch (err) {
        return res.status(403).json({ msg: "Invalid or expired token" });
    }
};
