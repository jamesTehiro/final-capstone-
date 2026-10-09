const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const DANGEROUS_URL_PATTERN = /^\s*(javascript:|vbscript:|data:(?!image\/))/i;
const URL_KEY_PATTERN = /(?:^|_)(url|avatar|logo|image|photo|link)$/i;

const sanitizeString = (value, key = "") => {
    const normalized = String(value).replace(CONTROL_CHAR_PATTERN, "").trim();

    if (URL_KEY_PATTERN.test(key) && DANGEROUS_URL_PATTERN.test(normalized)) {
        return "";
    }

    return normalized;
};

const sanitizeValue = (value, key = "") => {
    if (typeof value === "string") {
        return sanitizeString(value, key);
    }

    if (Array.isArray(value)) {
        return value.map((item) => sanitizeValue(item, key));
    }

    if (value && typeof value === "object") {
        return Object.entries(value).reduce((acc, [childKey, childValue]) => {
            acc[childKey] = sanitizeValue(childValue, childKey);
            return acc;
        }, {});
    }

    return value;
};

module.exports = (req, _res, next) => {
    ["body", "query", "params"].forEach((key) => {
        if (req[key]) {
            req[key] = sanitizeValue(req[key], key);
        }
    });

    next();
};
