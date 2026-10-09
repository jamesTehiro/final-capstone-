const jwt = require("jsonwebtoken");

const extractToken = (authorizationHeader = "") => {
    if (!authorizationHeader) return null;

    const parts = authorizationHeader.split(" ");
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
        return parts[1].trim();
    }

    return authorizationHeader.trim() || null;
};

module.exports = (req, res, next) => {
    const rawHeader = req.headers.authorization || req.headers.Authorization;
    const token = extractToken(rawHeader);

    if (!token || !process.env.JWT_SECRET) {
        req.user = null;
        return next();
    }

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        req.user = null;
    }

    return next();
};
