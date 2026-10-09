const fs = require("fs");
const path = require("path");
const db = require("../models");
const {
    isStoredFileReference,
    sendStoredFile
} = require("../services/objectStorage");

const uploadsRoot = path.join(__dirname, "..", "uploads");
const allowedPublicImageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const fileExists = async (absolutePath) => {
    try {
        await fs.promises.access(absolutePath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
};

const getPathCandidates = (folder, fileName) => {
    const safeFolder = String(folder || "").replace(/^\/+|\/+$/g, "");
    const safeFileName = path.basename(String(fileName || ""));
    const relativePath = `/uploads/${safeFolder}/${safeFileName}`;
    const absolutePath = path.join(uploadsRoot, safeFolder, safeFileName);
    const candidates = [{ relativePath, absolutePath }];

    // Backward compatibility for older profile images stored directly in /uploads.
    if (safeFolder === "images") {
        candidates.push({
            relativePath: `/uploads/${safeFileName}`,
            absolutePath: path.join(uploadsRoot, safeFileName)
        });
    }

    return candidates;
};

const getPublicImageCandidates = (fileName) => {
    const safeFileName = path.basename(String(fileName || ""));
    return [
        path.join(uploadsRoot, "images", safeFileName),
        path.join(uploadsRoot, safeFileName)
    ];
};

const canAccessApplicationFile = async (reqUser, relativePath) => {
    const application = await db.Application.findOne({
        where: {
            [db.Sequelize.Op.or]: [
                { resume_path: relativePath },
                { transcript_path: relativePath },
                { certificate_path: relativePath }
            ]
        },
        include: [{ model: db.Job }]
    });

    if (!application) return false;
    if (reqUser.role === "admin") return true;
    if (reqUser.role === "alumni" && application.alumni_id === reqUser.id) return true;
    if (reqUser.role === "employer" && application.Job?.employer_id === reqUser.id) return true;
    return false;
};

const normalizePathForComparison = (p) => {
    let s = String(p || "").replace(/\\/g, "/").toLowerCase();
    // Extract /uploads/... portion from Windows absolute paths like C:/path/uploads/documents/file.jpg
    const uploadsMatch = s.match(/(\/uploads\/.+)/);
    if (uploadsMatch) return uploadsMatch[1];
    // Remove Windows drive letter prefix (e.g., c:/)
    return s.replace(/^[a-z]:\//, "/");
};

const canAccessEmployerPermit = async (reqUser, relativePath) => {
    // First, try exact match
    let profile = await db.EmployerProfile.findOne({
        where: { business_permit_path: relativePath }
    });

    // If exact match failed, try normalized comparison for admin users
    if (!profile && reqUser.role === "admin") {
        const normalizedRequestPath = normalizePathForComparison(relativePath);
        const fileName = normalizedRequestPath.split("/").pop();

        if (fileName) {
            // Find all profiles with non-null business permit paths
            const profiles = await db.EmployerProfile.findAll({
                where: {
                    business_permit_path: { [db.Sequelize.Op.ne]: null }
                },
                attributes: ["id", "user_id", "business_permit_path"]
            });

            profile = profiles.find((p) => {
                const stored = normalizePathForComparison(p.business_permit_path);
                return stored === normalizedRequestPath ||
                    stored === fileName ||
                    stored.endsWith("/" + fileName) ||
                    normalizedRequestPath.endsWith(stored);
            }) || null;
        }
    }

    if (!profile) return false;
    if (reqUser.role === "admin") return true;
    if (reqUser.role === "employer" && profile.user_id === reqUser.id) return true;
    return false;
};

const canAccessProfileAsset = async (reqUser, relativePath) => {
    const alumniProfile = await db.AlumniProfile.findOne({ where: { avatar_url: relativePath } });
    if (alumniProfile) {
        if (reqUser.role === "admin") return true;
        if (alumniProfile.user_id === reqUser.id) return true;
        const viewer = await db.User.findByPk(reqUser.id);
        return viewer?.role === "alumni" || viewer?.role === "employer";
    }

    const employerProfile = await db.EmployerProfile.findOne({ where: { logo_url: relativePath } });
    if (employerProfile) {
        if (reqUser.role === "admin") return true;
        if (employerProfile.user_id === reqUser.id) return true;
        return true;
    }

    return false;
};

const canAccessAlumniProofDocument = async (reqUser, relativePath) => {
    const alumniProfile = await db.AlumniProfile.findOne({ where: { proof_document_path: relativePath } });
    if (!alumniProfile) return false;
    if (reqUser.role === "admin") return true;
    if (reqUser.role === "alumni" && alumniProfile.user_id === reqUser.id) return true;
    return false;
};

const canAccessPath = async (reqUser, relativePath) => {
    if (await canAccessApplicationFile(reqUser, relativePath)) return true;
    if (await canAccessEmployerPermit(reqUser, relativePath)) return true;
    if (await canAccessProfileAsset(reqUser, relativePath)) return true;
    if (await canAccessAlumniProofDocument(reqUser, relativePath)) return true;
    return false;
};

const encodeStoredPathToken = (storedPath) => Buffer.from(String(storedPath || ""), "utf8").toString("base64url");
const decodeStoredPathToken = (token = "") => {
    try {
        return Buffer.from(String(token || ""), "base64url").toString("utf8");
    } catch {
        return null;
    }
};

exports.getSecureFile = async (req, res, next) => {
    try {
        console.log("\n========== FILE ACCESS DIAGNOSTIC ==========");
        console.log("[DIAG] req.user:", JSON.stringify(req.user, null, 2));
        console.log("[DIAG] req.params.folder:", req.params.folder);
        console.log("[DIAG] req.params.fileName:", req.params.fileName);
        console.log("[DIAG] Authorization header present:", !!req.headers?.authorization);

        const candidates = getPathCandidates(req.params.folder, req.params.fileName);
        const requestedFolderRoot = path.join(uploadsRoot, String(req.params.folder || ""));

        console.log("[DIAG] candidates:", JSON.stringify(candidates, null, 2));

        if (!candidates[0].absolutePath.startsWith(requestedFolderRoot)) {
            return res.status(400).json({ msg: "Invalid file path." });
        }

        const resolvedCandidate = await (async () => {
            for (const candidate of candidates) {
                // eslint-disable-next-line no-await-in-loop
                if (await fileExists(candidate.absolutePath)) return candidate;
            }
            return null;
        })();

        console.log("[DIAG] resolvedCandidate:", JSON.stringify(resolvedCandidate, null, 2));

        if (!resolvedCandidate) {
            return res.status(404).json({ msg: "File not found." });
        }

        const allowed = await canAccessPath(req.user, resolvedCandidate.relativePath);
        console.log("[DIAG] canAccessPath result:", allowed);
        console.log("[DIAG] relativePath checked:", resolvedCandidate.relativePath);
        if (!allowed) {
            return res.status(403).json({ msg: "You are not allowed to access this file." });
        }

        return res.sendFile(resolvedCandidate.absolutePath);
    } catch (err) {
        console.error("[DIAG] getSecureFile error:", err);
        return next(err);
    }
};

exports.getSecureStoredFile = async (req, res, next) => {
    try {
        const storedPath = decodeStoredPathToken(req.params.token);
        if (!storedPath) {
            return res.status(404).json({ msg: "File not found." });
        }

        const allowed = await canAccessPath(req.user, storedPath);
        if (!allowed) {
            return res.status(403).json({ msg: "You are not allowed to access this file." });
        }

        if (isStoredFileReference(storedPath) || /^https?:\/\//i.test(storedPath)) {
            return sendStoredFile(storedPath, res);
        }

        return res.status(404).json({ msg: "Stored file not found." });
    } catch (err) {
        return next(err);
    }
};

exports.getPublicImage = async (req, res, next) => {
    try {
        const fileName = path.basename(String(req.params.fileName || ""));
        const extension = path.extname(fileName).toLowerCase();

        if (!fileName || !allowedPublicImageExtensions.has(extension)) {
            return res.status(404).json({ msg: "Image not found." });
        }

        const candidates = getPublicImageCandidates(fileName);
        const resolvedPath = await (async () => {
            for (const candidate of candidates) {
                // eslint-disable-next-line no-await-in-loop
                if (await fileExists(candidate)) return candidate;
            }
            return null;
        })();

        if (!resolvedPath) {
            return res.status(404).json({ msg: "Image not found." });
        }

        return res.sendFile(resolvedPath);
    } catch (err) {
        return next(err);
    }
};

exports.toSecureFileUrl = (storedPath) => {
    if (!storedPath) return storedPath;
    if (isStoredFileReference(storedPath) || /^https?:\/\//i.test(String(storedPath))) {
        return `/api/files/secure/${encodeStoredPathToken(storedPath)}`;
    }
    if (String(storedPath).startsWith("/uploads/")) {
        const [, , folder, fileName] = String(storedPath).split("/");
        return `/api/files/${folder}/${fileName}`;
    }
    // Handle Windows absolute paths like C:\Alumni\backend\uploads\documents\file.pdf
    const winPathMatch = String(storedPath).match(/^[A-Za-z]:\\(?:.*[/\\])?uploads[/\\]([^/\\]+)[/\\]([^/\\]+)$/i);
    if (winPathMatch) {
        return `/api/files/${winPathMatch[1]}/${encodeURIComponent(winPathMatch[2])}`;
    }
    // Handle file:/// URLs like file:///C:/Alumni/backend/uploads/documents/file.pdf
    const fileProtocolMatch = String(storedPath).match(/^file:\/\/(?:[A-Za-z]:)?[/\\]?(?:.*[/\\])?uploads[/\\]([^/\\]+)[/\\]([^/\\]+)$/i);
    if (fileProtocolMatch) {
        return `/api/files/${fileProtocolMatch[1]}/${encodeURIComponent(fileProtocolMatch[2])}`;
    }
    return storedPath;
};
