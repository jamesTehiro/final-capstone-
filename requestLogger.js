module.exports = (req, res, next) => {
    const shouldLogRequests =
        process.env.LOG_REQUESTS === "true" ||
        (process.env.NODE_ENV !== "production" && process.env.LOG_REQUESTS !== "false");

    if (!shouldLogRequests) {
        return next();
    }

    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        // eslint-disable-next-line no-console
        console.log(
            `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`
        );
    });
    next();
};
