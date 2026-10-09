const crypto = require("crypto");
const path = require("path");

const provider = String(process.env.OBJECT_STORAGE_PROVIDER || "cloudinary").trim().toLowerCase();
const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
const apiKey = String(process.env.CLOUDINARY_API_KEY || "").trim();
const apiSecret = String(process.env.CLOUDINARY_API_SECRET || "").trim();

const REF_PREFIX = "cld:";

const isObjectStorageEnabled = () => provider === "cloudinary" && !!cloudName && !!apiKey && !!apiSecret;

const ensureObjectStorageConfigured = () => {
    if (isObjectStorageEnabled()) return;
    const err = new Error("Shared object storage is not configured.");
    err.status = 500;
    throw err;
};

const sanitizeBaseName = (value = "", fallback = "file") =>
    String(value || fallback)
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || fallback;

const buildPublicId = ({ folder, prefix, originalName }) => {
    const extension = path.extname(String(originalName || "")).toLowerCase();
    const safePrefix = sanitizeBaseName(prefix, "file");
    const safeFolder = String(folder || "")
        .replace(/^\/+|\/+$/g, "")
        .replace(/[^a-zA-Z0-9/_-]+/g, "");
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const fileName = `${safePrefix}-${uniqueSuffix}${extension}`;
    return safeFolder ? `${safeFolder}/${fileName}` : fileName;
};

const signCloudinaryParams = (params) => {
    const payload = Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join("&");

    return crypto.createHash("sha1").update(`${payload}${apiSecret}`).digest("hex");
};

const encodeStoredFileReference = (payload) =>
    `${REF_PREFIX}${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;

const parseStoredFileReference = (value) => {
    if (!value || typeof value !== "string" || !value.startsWith(REF_PREFIX)) return null;

    try {
        return JSON.parse(Buffer.from(value.slice(REF_PREFIX.length), "base64url").toString("utf8"));
    } catch {
        return null;
    }
};

const isStoredFileReference = (value) => !!parseStoredFileReference(value);

const uploadBuffer = async ({ buffer, mimeType, originalName, folder, prefix, isPublic }) => {
    ensureObjectStorageConfigured();

    if (typeof fetch !== "function" || typeof FormData !== "function" || typeof Blob !== "function") {
        const err = new Error("Node runtime does not support fetch/FormData uploads.");
        err.status = 500;
        throw err;
    }

    const publicId = buildPublicId({ folder, prefix, originalName });
    const timestamp = Math.floor(Date.now() / 1000);
    const resourceType = String(mimeType || "").startsWith("image/") ? "image" : "raw";
    const type = "upload";

    const signature = signCloudinaryParams({
        public_id: publicId,
        timestamp,
        type
    });

    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mimeType || "application/octet-stream" }), originalName || path.basename(publicId));
    form.append("api_key", apiKey);
    form.append("timestamp", String(timestamp));
    form.append("public_id", publicId);
    form.append("type", type);
    form.append("signature", signature);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
        method: "POST",
        body: form
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.secure_url || !data?.public_id) {
        const err = new Error(data?.error?.message || "Object storage upload failed.");
        err.status = 502;
        throw err;
    }

    const storedRef = encodeStoredFileReference({
        provider: "cloudinary",
        resourceType: data.resource_type || resourceType,
        type: data.type || type,
        publicId: data.public_id,
        url: data.secure_url,
        originalName: originalName || path.basename(publicId)
    });

    return {
        publicUrl: data.secure_url,
        storageRef: isPublic ? data.secure_url : storedRef,
        remoteUrl: data.secure_url,
        publicId: data.public_id,
        resourceType: data.resource_type || resourceType,
        type: data.type || type
    };
};

const uploadDataUrl = async ({ dataUrl, folder, prefix }) => {
    if (!dataUrl || typeof dataUrl !== "string") return null;
    const matches = dataUrl.match(/^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/);
    if (!matches) return null;

    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], "base64");
    const extension = mimeType.split("/")[1] || "png";
    const originalName = `${sanitizeBaseName(prefix, "image")}.${extension}`;

    const result = await uploadBuffer({
        buffer,
        mimeType,
        originalName,
        folder,
        prefix,
        isPublic: true
    });

    return result.publicUrl;
};

const destroyStoredFile = async (storedValue) => {
    const parsed = parseStoredFileReference(storedValue);
    if (!parsed) return false;

    ensureObjectStorageConfigured();

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signCloudinaryParams({
        public_id: parsed.publicId,
        timestamp,
        type: parsed.type || "upload",
        invalidate: true
    });

    const form = new URLSearchParams();
    form.set("api_key", apiKey);
    form.set("timestamp", String(timestamp));
    form.set("public_id", parsed.publicId);
    form.set("type", parsed.type || "upload");
    form.set("invalidate", "true");
    form.set("signature", signature);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${parsed.resourceType || "raw"}/destroy`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: form.toString()
    });

    return response.ok;
};

const getDownloadSourceUrl = (storedValue) => {
    const parsed = parseStoredFileReference(storedValue);
    if (parsed?.url) return parsed.url;
    if (/^https?:\/\//i.test(String(storedValue || ""))) return storedValue;
    return null;
};

const getStoredFileOriginalName = (storedValue) => {
    const parsed = parseStoredFileReference(storedValue);
    return parsed?.originalName || null;
};

const sendStoredFile = async (storedValue, res, downloadName = null) => {
    const sourceUrl = getDownloadSourceUrl(storedValue);
    if (!sourceUrl) {
        const err = new Error("Stored file URL could not be resolved.");
        err.status = 404;
        throw err;
    }

    const response = await fetch(sourceUrl);
    if (!response.ok) {
        const err = new Error("Stored file could not be downloaded.");
        err.status = response.status || 502;
        throw err;
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const buffer = Buffer.from(await response.arrayBuffer());

    res.setHeader("Content-Type", contentType);
    if (downloadName) {
        const safeName = String(downloadName).replace(/[\r\n"]/g, "_");
        res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    }
    return res.send(buffer);
};

module.exports = {
    isObjectStorageEnabled,
    uploadBuffer,
    uploadDataUrl,
    destroyStoredFile,
    sendStoredFile,
    isStoredFileReference,
    parseStoredFileReference,
    getStoredFileOriginalName
};
