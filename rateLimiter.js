const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000); // 15 minutes
const maxRequests = Number(process.env.RATE_LIMIT_MAX || 100);
const isProduction = process.env.NODE_ENV === "production";
const storeMode = (process.env.RATE_LIMIT_STORE || (isProduction ? "proxy" : "database")).toLowerCase();
const { consumeRateLimit } = require("../utils/rateLimitStore");

const getClientKey = (req) => {
    const forwardedFor = req.headers["x-forwarded-for"];
    if (typeof forwardedFor === "string" && forwardedFor.trim()) {
        return forwardedFor.split(",")[0].trim();
    }

    return req.ip || req.connection?.remoteAddress || "unknown";
};

const setRateLimitHeaders = (res, remaining) => {
    res.setHeader("X-RateLimit-Limit", String(maxRequests));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
    res.setHeader("X-RateLimit-Window-Ms", String(windowMs));
};

module.exports = async (req, res, next) => {
    if (storeMode === "proxy") {
        res.setHeader("X-RateLimit-Mode", "proxy");
        return next();
    }

    try {
        const result = await consumeRateLimit({
            scope: "global",
            key: getClientKey(req),
            windowMs,
            maxRequests
        });

        setRateLimitHeaders(res, result.remaining);
        res.setHeader("X-RateLimit-Reset", String(result.resetAt));

        if (!result.allowed) {
            return res.status(429).json({ msg: "Too many requests, please try again later." });
        }
    } catch (err) {
        if (!isProduction) {
            // eslint-disable-next-line no-console
            console.warn("Rate limit store failed, allowing request:", err.message);
        }
    }

    return next();
};
