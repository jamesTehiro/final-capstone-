const multer = require("multer");
const path = require("path");
const fs = require("fs");
const {
    isObjectStorageEnabled,
    uploadBuffer,
    destroyStoredFile
} = require("../services/objectStorage");

const ensuredDirs = new Set();
const ensureDir = async (dir) => {
    if (ensuredDirs.has(dir)) return;
    await fs.promises.mkdir(dir, { recursive: true });
    ensuredDirs.add(dir);
};

const root = path.join(__dirname, "..", "uploads");
const privateChatRoot = path.join(__dirname, "..", "private_uploads", "chat");
const privateAdminEmployerRoot = path.join(__dirname, "..", "private_uploads", "admin_employer");
const limits = {
    fileSize: Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024
};

const allowedExtensions = /\.(pdf|doc|docx|png|jpe?g|webp|gif)$/i;
const allowedMimes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif"
];

const fileFilter = (_req, file, cb) => {
    const isAllowed = allowedMimes.includes(file.mimetype) || allowedExtensions.test(file.originalname);
    if (!isAllowed) {
        return cb(new Error("Invalid file type. Allowed: pdf, doc, docx, png, jpg, webp."));
    }
    return cb(null, true);
};

const getTargetForField = (fieldName = "") => {
    if (fieldName === "avatar_image") return { folder: "uploads/images", isPublic: true, prefix: "avatar" };
    if (fieldName === "logo_image") return { folder: "uploads/images", isPublic: true, prefix: "logo" };
    if (fieldName === "resume") return { folder: "private_uploads/resumes", isPublic: false, prefix: "resume" };
    if (fieldName === "transcript") return { folder: "private_uploads/documents", isPublic: false, prefix: "transcript" };
    if (fieldName === "certificate") return { folder: "private_uploads/documents", isPublic: false, prefix: "certificate" };
    if (fieldName === "proof_document") return { folder: "private_uploads/alumni_proof", isPublic: false, prefix: "proof-document" };
    if (fieldName === "business_permit") return { folder: "private_uploads/business_permits", isPublic: false, prefix: "business-permit" };
    if (fieldName === "attachment") return { folder: "private_uploads/chat", isPublic: false, prefix: "attachment" };
    return { folder: "private_uploads/documents", isPublic: false, prefix: fieldName || "file" };
};

const createCloudStorageEngine = () => ({
    _handleFile: (req, file, cb) => {
        const chunks = [];
        file.stream.on("data", (chunk) => chunks.push(chunk));
        file.stream.on("error", (err) => cb(err));
        file.stream.on("end", async () => {
            try {
                const buffer = Buffer.concat(chunks);
                const target = getTargetForField(file.fieldname);
                const uploaded = await uploadBuffer({
                    buffer,
                    mimeType: file.mimetype,
                    originalName: file.originalname,
                    folder: target.folder,
                    prefix: target.prefix,
                    isPublic: target.isPublic
                });

                cb(null, {
                    size: buffer.length,
                    filename: path.basename(uploaded.publicId || file.originalname),
                    path: uploaded.storageRef || uploaded.publicUrl,
                    storageRef: uploaded.storageRef || null,
                    publicUrl: uploaded.publicUrl || null,
                    mimetype: file.mimetype,
                    originalname: file.originalname
                });
            } catch (err) {
                cb(err);
            }
        });
    },
    _removeFile: async (_req, file, cb) => {
        try {
            if (file?.storageRef) {
                await destroyStoredFile(file.storageRef);
            }
            cb(null);
        } catch (err) {
            cb(err);
        }
    }
});

const localStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        let dest = path.join(root, "documents");
        if (file.fieldname === "resume") dest = path.join(root, "resumes");
        if (file.fieldname === "proof_document") dest = path.join(root, "documents");
        if (file.fieldname === "avatar_image" || file.fieldname === "logo_image") dest = path.join(root, "images");
        if (file.fieldname === "attachment" && req.originalUrl.includes("/admin-employer/")) {
            dest = privateAdminEmployerRoot;
        } else if (file.fieldname === "attachment") {
            dest = privateChatRoot;
        }

        ensureDir(dest)
            .then(() => cb(null, dest))
            .catch((err) => cb(err));
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname) || "";
        const safeExt = allowedExtensions.test(ext) ? ext : "";
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
        cb(null, `${file.fieldname}-${unique}${safeExt}`);
    }
});

const storage = isObjectStorageEnabled() ? createCloudStorageEngine() : localStorage;
const upload = multer({ storage, limits, fileFilter });
const profileUpload = multer({ storage, limits, fileFilter }).fields([
    { name: "avatar_image", maxCount: 1 },
    { name: "logo_image", maxCount: 1 }
]);

/**
 * Legacy explicit fields for backward compatibility
 */
const legacyApplicationFields = [
    { name: "resume", maxCount: 1 },
    { name: "transcript", maxCount: 1 },
    { name: "certificate", maxCount: 1 }
];

const MAX_APPLICATION_FILES = Number(process.env.MAX_APPLICATION_FILES || 20);

/**
 * Dynamic requirement file fields:
 * Frontend will send files with field names like:
 *   requirement_resume
 *   requirement_transcript
 *   requirement_valid_govt_id
 *   requirement_tor
 *   requirement_custom_1783662439285_m9drxh_0
 *   ...
 * We accept any file whose fieldname starts with "requirement_" (employer-defined
 * dynamic requirements) as well as the legacy explicit fields (resume, transcript,
 * certificate). Everything else is rejected with LIMIT_UNEXPECTED_FILE semantics.
 *
 * Security controls preserved:
 *  - allowed MIME types
 *  - allowed file extensions
 *  - maximum upload size (limits.fileSize)
 *  - maximum number of uploaded files
 */
const dynamicRequirementFilter = (req, file, cb) => {
    const isLegacy = legacyApplicationFields.some((f) => f.name === file.fieldname);
    const isDynamic = file.fieldname.startsWith("requirement_");

    if (!isLegacy && !isDynamic) {
        // Surface as a Multer-style unexpected field error (handled in errorHandler)
        const err = new Error(`Unexpected file field: ${file.fieldname}`);
        err.code = "LIMIT_UNEXPECTED_FILE";
        err.field = file.fieldname;
        return cb(err);
    }

    // Enforce allowed MIME types / extensions
    const isAllowedType =
        allowedMimes.includes(file.mimetype) || allowedExtensions.test(file.originalname);
    if (!isAllowedType) {
        return cb(new Error("Invalid file type. Allowed: pdf, doc, docx, png, jpg, jpeg."));
    }

    // Enforce maximum number of uploaded files
    req._uploadFileCount = (req._uploadFileCount || 0) + 1;
    if (req._uploadFileCount > MAX_APPLICATION_FILES) {
        const err = new Error("Too many files uploaded.");
        err.code = "LIMIT_FILE_COUNT";
        return cb(err);
    }

    return cb(null, true);
};

/**
 * Use .any() so dynamically generated requirement codes are accepted. The fileFilter
 * is responsible for rejecting unexpected fields (legacy + requirement_* allowed).
 * We cannot use .fields() because the field names are not known ahead of time.
 */
const dynamicRequirementUpload = multer({
    storage,
    limits,
    fileFilter: dynamicRequirementFilter
}).any();

/**
 * Public middleware for backward compatibility.
 * .any() stores files as an array on req.files; the controller (and legacy branch)
 * expects a fieldname-keyed object ({ fieldname: [file, ...] }). We restructure the
 * array into that shape so no controller changes are required.
 * @type {import("express").RequestHandler}
 */
const applicationUpload = (req, res, next) => {
    return dynamicRequirementUpload(req, res, (err) => {
        if (err) {
            return next(err);
        }
        if (Array.isArray(req.files)) {
            const grouped = {};
            for (const file of req.files) {
                if (!grouped[file.fieldname]) grouped[file.fieldname] = [];
                grouped[file.fieldname].push(file);
            }
            req.files = grouped;
        }
        // DEBUG: Log all uploaded files after Multer
        console.log('[DEBUG uploadMiddleware] Object.keys(req.body):', Object.keys(req.body || {}));
        console.log('[DEBUG uploadMiddleware] Object.keys(req.files || {}):', Object.keys(req.files || {}));
        for (const [fieldName, files] of Object.entries(req.files || {})) {
            console.log('[DEBUG uploadMiddleware] Uploaded field:', {
                fieldname: fieldName,
                originalname: files?.[0]?.originalname
            });
        }
        return next();
    });
};

exports.applicationUpload = applicationUpload;

exports.registrationUpload = upload.fields([
    { name: "business_permit", maxCount: 1 },
    { name: "proof_document", maxCount: 1 }
]);

exports.employerRegistrationUpload = upload.fields([
    { name: "business_permit", maxCount: 1 }
]);

exports.alumniRegistrationUpload = upload.single("proof_document");

exports.chatAttachmentUpload = upload.single("attachment");
exports.adminEmployerAttachmentUpload = upload.single("attachment");

exports.optionalProfileUpload = (req, res, next) => {
    if (!String(req.headers["content-type"] || "").includes("multipart/form-data")) {
        return next();
    }
    return profileUpload(req, res, next);
};
