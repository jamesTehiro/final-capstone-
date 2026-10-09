// Centralized error handler to keep API responses consistent
const MULTER_ERROR_STATUS = {
    LIMIT_PART_COUNT: 400,
    LIMIT_FILE_SIZE: 413,
    LIMIT_FILE_COUNT: 413,
    LIMIT_FIELD_KEY: 400,
    LIMIT_FIELD_VALUE: 400,
    LIMIT_FIELD_COUNT: 400,
    LIMIT_UNEXPECTED_FILE: 400
};

const MULTER_USER_FRIENDLY_MESSAGES = {
    LIMIT_FILE_SIZE: "Upload Failed: The selected file is too large. Please upload a file within the maximum allowed size.",
    LIMIT_FILE_COUNT: "Upload Failed: Too many files uploaded at once. Please upload fewer files.",
    LIMIT_UNEXPECTED_FILE: "Upload Failed: An unexpected file field was submitted. Please check your form and try again.",
    LIMIT_PART_COUNT: "Upload Failed: Too many parts in the request. Please try again with fewer files.",
    LIMIT_FIELD_KEY: "Upload Failed: Invalid field name in the upload request.",
    LIMIT_FIELD_VALUE: "Upload Failed: Field value is too large.",
    LIMIT_FIELD_COUNT: "Upload Failed: Too many form fields."
};

const mapErrorToStatus = (err) => {
    // Multer errors expose a string `code` (e.g. LIMIT_UNEXPECTED_FILE)
    if (err.code && MULTER_ERROR_STATUS[err.code]) {
        return MULTER_ERROR_STATUS[err.code];
    }
    // Explicit status set by application code
    if (err.status && Number.isInteger(err.status)) {
        return err.status;
    }
    return 500;
};

module.exports = (err, req, res, next) => {
    // eslint-disable-next-line no-console
    console.error(err);

    if (res.headersSent) {
        return next(err);
    }

    const status = mapErrorToStatus(err);
    const isProduction = process.env.NODE_ENV === "production";

    // Sanitize message for unexpected 500s in production
    let message = err.message || "Internal server error";
    let code = err.code || null;

    // Use user-friendly messages for known upload errors
    if (code && MULTER_USER_FRIENDLY_MESSAGES[code]) {
        message = MULTER_USER_FRIENDLY_MESSAGES[code];
    }

    // Handle invalid file type message
    if (message && message.includes("Invalid file type")) {
        message = "Upload Failed: Invalid file type. Allowed types: PDF, DOC, DOCX, PNG, JPG, JPEG, WEBP, and GIF.";
    }

    if (status >= 500 && isProduction) {
        message = "Internal server error";
        code = null;
    }

    // Don't leak raw error codes to clients for unknown server errors
    const responseBody = { msg: message };
    if (code && status < 500) {
        responseBody.code = code;
    }

    return res.status(status).json(responseBody);
};