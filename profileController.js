const fs = require("fs");
const path = require("path");
const db = require("../models");
const { uploadDataUrl } = require("../services/objectStorage");

const uploadsDir = path.join(__dirname, "..", "uploads");
const imageUploadsDir = path.join(uploadsDir, "images");
const maxBase64UploadBytes = Number(process.env.MAX_PROFILE_UPLOAD_MB || 5) * 1024 * 1024;
const allowedImageMimes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const profileImagePathPattern = /^\/uploads(?:\/images)?\/([^/?#]+)$/i;

const buildCanonicalImagePath = (fileName) => {
    const safeFileName = path.basename(String(fileName || ""));
    return safeFileName ? `/uploads/images/${safeFileName}` : null;
};

const normalizeStoredImagePath = (value) => {
    if (!value || typeof value !== "string") return null;
    if (value.startsWith("data:")) return value;
    if (/^https?:\/\//i.test(value)) return value;

    const match = value.match(profileImagePathPattern);
    if (!match) return value;
    return buildCanonicalImagePath(match[1]);
};

const saveBase64Image = async (dataUrl, prefix = "file") => {
    if (!dataUrl || typeof dataUrl !== "string") return null;
    const matches = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!matches) return null;
    if (!allowedImageMimes.has(matches[1])) {
        const err = new Error("Unsupported image type.");
        err.status = 400;
        throw err;
    }

    if (!fs.existsSync(imageUploadsDir)) {
        fs.mkdirSync(imageUploadsDir, { recursive: true });
    }

    const buffer = Buffer.from(matches[2], "base64");
    if (buffer.byteLength > maxBase64UploadBytes) {
        const err = new Error("Image exceeds allowed size.");
        err.status = 400;
        throw err;
    }

    const uploadedUrl = await uploadDataUrl({
        dataUrl,
        folder: "uploads/images",
        prefix
    }).catch(() => null);

    if (uploadedUrl) return uploadedUrl;

    if (!fs.existsSync(imageUploadsDir)) {
        fs.mkdirSync(imageUploadsDir, { recursive: true });
    }

    const extension = matches[1].split("/")[1] || "png";
    const fileName = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}.${extension}`;
    const filePath = path.join(imageUploadsDir, fileName);
    await fs.promises.writeFile(filePath, buffer);
    return buildCanonicalImagePath(fileName);
};

const baseProfileInclude = [
    {
        model: db.AlumniProfile,
        include: [{ model: db.EmploymentHistory }]
    },
    { model: db.EmployerProfile }
];

const toLimitedProfile = (target) => ({
    id: target.id,
    name: target.name,
    role: target.role,
    AlumniProfile: target.AlumniProfile
        ? {
            course: target.AlumniProfile.course,
            graduation_year: target.AlumniProfile.graduation_year,
            avatar_url: target.AlumniProfile.avatar_url,
            profile_visibility: target.AlumniProfile.profile_visibility || "private",
            employment_status: target.AlumniProfile.employment_status ?? null,
            current_company: target.AlumniProfile.current_company ?? null,
            job_title: target.AlumniProfile.job_title ?? null,
            address: target.AlumniProfile.address ?? null
        }
        : null,
    EmployerProfile: target.EmployerProfile

        ? {
            organization_name: target.EmployerProfile.organization_name,
            logo_url: target.EmployerProfile.logo_url
        }
        : null,
    admin_department: target.admin_department || null,
    admin_avatar_url: target.admin_avatar_url || null
});

const canEmployerViewAlumniResume = async (employerId, alumniId) => {
    const application = await db.Application.findOne({
        where: { alumni_id: alumniId },
        include: [
            {
                model: db.Job,
                where: { employer_id: employerId }
            }
        ]
    });

    return !!application;
};

// GET current user's profile
exports.getProfile = async (req, res) => {
    try {
        const user = await db.User.findByPk(req.user.id, {
            include: baseProfileInclude,
            attributes: { exclude: ["password"] }
        });
        res.json(user);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

// GET a user's profile with access rules
exports.getUserProfileById = async (req, res) => {
    try {
        const targetUserId = Number(req.params.userId);
        if (!targetUserId) {
            return res.status(400).json({ msg: "Invalid user id." });
        }

        const viewer = await db.User.findByPk(req.user.id);
        if (!viewer) {
            return res.status(401).json({ msg: "Unauthorized" });
        }

        const target = await db.User.findByPk(targetUserId, {
            include: baseProfileInclude,
            attributes: { exclude: ["password"] }
        });
        if (!target) {
            return res.status(404).json({ msg: "User not found" });
        }

        const isSelf = viewer.id === target.id;
        const isAdmin = viewer.role === "admin";

        if (!isSelf && !isAdmin && viewer.role === "employer" && target.role === "alumni") {
            const allowed = await canEmployerViewAlumniResume(viewer.id, target.id);
            if (!allowed) {
                return res.status(403).json({
                    msg: "You can view this alumni profile only after they apply to one of your jobs."
                });
            }
        }

        const targetVisibility = target.AlumniProfile?.profile_visibility || "public";
        if (!isSelf && !isAdmin && target.role === "alumni" && targetVisibility !== "public") {
            return res.json(toLimitedProfile(target));
        }

        res.json(target);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

// UPDATE profile
exports.updateProfile = async (req, res, next) => {
    try {
        const {
            name,
            email,
            course,
            graduation_year,
            phone,
            address,
            profile_visibility,
            avatar_url,
            employment_status,
            current_company,
            job_title,
            employment_history,
            organization_name,
            industry,
            contact_email,
            logo_url,
            admin_department,
            admin_avatar_url
        } = req.body;

        const user = await db.User.findByPk(req.user.id);
        if (!user) return res.status(404).json({ msg: "User not found" });

        await user.update({
            name: name ?? user.name,
            email: email ?? user.email
        });

        if (user.role === "alumni") {
            const avatarUpload = req.files?.avatar_image?.[0];
            const avatarPath = avatarUpload
                ? avatarUpload.publicUrl || avatarUpload.path || buildCanonicalImagePath(avatarUpload.filename)
                : await saveBase64Image(avatar_url, "avatar");
            const [alumniProfile] = await db.AlumniProfile.findOrCreate({
                where: { user_id: req.user.id },
                defaults: { user_id: req.user.id }
            });

            const employmentStatusAllowed = ["employed", "unemployed", "self-employed"];

            const rawEmploymentStatus = employment_status;
            const normalizedEmploymentStatus = rawEmploymentStatus
                ? String(rawEmploymentStatus).trim().toLowerCase()
                : null;

            if (
                normalizedEmploymentStatus !== null &&
                normalizedEmploymentStatus !== "" &&
                !employmentStatusAllowed.includes(normalizedEmploymentStatus)
            ) {
                return res.status(400).json({ msg: "Invalid employment_status." });
            }

            await alumniProfile.update({
                course: course ?? alumniProfile.course,
                graduation_year: graduation_year ?? alumniProfile.graduation_year,
                phone: phone ?? alumniProfile.phone,
                address: address ?? alumniProfile.address,
                profile_visibility: profile_visibility ?? alumniProfile.profile_visibility,
                employment_status:
                    normalizedEmploymentStatus === null || normalizedEmploymentStatus === ""
                        ? null
                        : normalizedEmploymentStatus,
                current_company: current_company ?? alumniProfile.current_company,
                job_title: job_title ?? alumniProfile.job_title,
                avatar_url:
                    avatarPath ||
                    normalizeStoredImagePath(avatar_url) ||
                    normalizeStoredImagePath(alumniProfile.avatar_url)
            });

            console.log("[updateProfile] employment_status saved:", {
                rawEmploymentStatus,
                normalizedEmploymentStatus,
                storedEmploymentStatus: normalizedEmploymentStatus === null || normalizedEmploymentStatus === "" ? null : normalizedEmploymentStatus
            });


            if (Array.isArray(employment_history)) {
                await db.EmploymentHistory.destroy({
                    where: { alumni_id: alumniProfile.id }
                });

                const cleanHistory = employment_history
                    .map((item) => ({
                        alumni_id: alumniProfile.id,
                        company_name: (item?.company_name || "").trim(),
                        position: (item?.position || "").trim(),
                        start_year: item?.start_year ? Number(item.start_year) : null,
                        end_year: item?.end_year === "Present" || item?.end_year === null || item?.end_year === "" ? null : Number(item.end_year),
                        employment_type: (item?.employment_type || "").trim() || "Full-time"
                    }))
                    .filter((item) => item.company_name && item.position && item.start_year);

                if (cleanHistory.length > 0) {
                    await db.EmploymentHistory.bulkCreate(cleanHistory);
                }
            }
        }

        if (user.role === "employer") {
            const logoUpload = req.files?.logo_image?.[0];
            const logoPath = logoUpload
                ? logoUpload.publicUrl || logoUpload.path || buildCanonicalImagePath(logoUpload.filename)
                : await saveBase64Image(logo_url, "logo");
            const [employerProfile] = await db.EmployerProfile.findOrCreate({
                where: { user_id: req.user.id },
                defaults: { user_id: req.user.id }
            });

            await employerProfile.update({
                organization_name: organization_name ?? employerProfile.organization_name,
                industry: industry ?? employerProfile.industry,
                address: address ?? employerProfile.address,
                contact_email: contact_email ?? employerProfile.contact_email,
                logo_url:
                    logoPath ||
                    normalizeStoredImagePath(logo_url) ||
                    normalizeStoredImagePath(employerProfile.logo_url)
            });
        }

        if (user.role === "admin") {
            const adminAvatarPath = await saveBase64Image(admin_avatar_url, "admin-avatar");
            await user.update({
                name: name ?? user.name,
                email: email ?? user.email,
                admin_department: admin_department ?? user.admin_department,
                admin_avatar_url:
                    adminAvatarPath ||
                    normalizeStoredImagePath(admin_avatar_url) ||
                    normalizeStoredImagePath(user.admin_avatar_url)
            });
        }

        const updatedUser = await db.User.findByPk(req.user.id, {
            include: baseProfileInclude,
            attributes: { exclude: ["password"] }
        });

        res.json({ msg: "Profile updated", user: updatedUser });
    } catch (err) {
        next(err);
    }
};
