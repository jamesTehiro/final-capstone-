const db = require("../models");
const notificationController = require("./notificationController");
const jobController = require("./jobController");
const { toSecureFileUrl } = require("./fileController");

const normalizeAccountStatus = (status) => String(status || "").toLowerCase();
const allowedAccountStatuses = ["pending", "verified", "suspended", "rejected", "deactivated"];

const normalizeJobStatus = (status) => String(status || "").toLowerCase();
const allowedJobStatuses = ["pending", "approved", "rejected"];

// ALUMNI ADMIN
exports.getAlumniUsers = async (req, res) => {
    try {
        const users = await db.User.findAll({
            where: { role: "alumni" },
            include: [
                {
                    model: db.AlumniProfile,
                    include: [
                        {
                            model: db.EmploymentHistory,
                            required: false,
                            limit: 1,
                            order: [["start_year", "DESC"]]
                        }
                    ]
                }
            ],
            order: [["createdAt", "DESC"]]
        });

        const plainUsers = users.map((u) => {
            const json = u.toJSON ? u.toJSON() : { ...u };
            const employmentList = json.AlumniProfile?.EmploymentHistories || [];
            const latestEmployment = employmentList[0] || null;
            return {
                ...json,
                AlumniProfile: {
                    ...json.AlumniProfile,
                    latestEmployment: latestEmployment
                        ? `${latestEmployment.company_name} - ${latestEmployment.position}`
                        : "Unemployed"
                }
            };
        });

        res.json(plainUsers);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.updateAlumniUserStatus = async (req, res) => {
    try {
        const status = normalizeAccountStatus(req.body.status);
        if (!allowedAccountStatuses.includes(status)) {
            return res.status(400).json({ msg: "Invalid account status." });
        }

        const user = await db.User.findByPk(req.params.userId);
        if (!user || user.role !== "alumni") {
            return res.status(404).json({ msg: "Alumni user not found." });
        }

        user.account_status = status;
        await user.save();

        res.json({ msg: "Alumni account updated.", user });
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.createAlumniAnnouncement = async (req, res) => {
    try {
        const { title, content, target_year, day, time, location } = req.body;
        if (!title || !content) {
            return res.status(400).json({ msg: "Title and content are required." });
        }

        const announcementTable = await db.sequelize.getQueryInterface().describeTable(
            db.Announcement.getTableName()
        );

        const announcementPayload = {
            title,
            content,
            admin_id: req.user.id
        };

        if (Object.prototype.hasOwnProperty.call(announcementTable, "day")) {
            announcementPayload.day = day || null;
        }

        if (Object.prototype.hasOwnProperty.call(announcementTable, "time")) {
            announcementPayload.time = time || null;
        }

        if (Object.prototype.hasOwnProperty.call(announcementTable, "location")) {
            announcementPayload.location = location || null;
        }

        const announcement = await db.Announcement.create(announcementPayload);

        const alumniWhere = { role: "alumni", account_status: "verified" };
        const targetYearValue = (target_year || "").trim();
        let yearFilter = null;
        if (targetYearValue) {
            const parsedYear = Number(targetYearValue);
            if (Number.isNaN(parsedYear)) {
                return res.status(400).json({ msg: "Target graduation year must be numeric." });
            }
            yearFilter = parsedYear;
        }

        const alumniInclude = [];
        if (yearFilter) {
            alumniInclude.push({
                model: db.AlumniProfile,
                where: { graduation_year: yearFilter },
                attributes: []
            });
        }

        const alumniUsers = await db.User.findAll({
            where: alumniWhere,
            include: alumniInclude,
            attributes: ["id"]
        });
        const alumniIds = alumniUsers.map((u) => u.id);

        if (alumniIds.length) {
            await notificationController.createNotification({
                userIds: alumniIds,
                message: `New announcement: ${title}`,
                subject: "New Announcement from Alumni Admin"
            });
        }

        res.json(announcement);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.getAnnouncements = async (req, res) => {
    try {
        const announcements = await db.Announcement.findAll({
            order: [["createdAt", "DESC"]]
        });
        res.json(announcements);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.deleteAnnouncement = async (req, res) => {
    try {
        const announcement = await db.Announcement.findByPk(req.params.id);
        if (!announcement) return res.status(404).json({ msg: "Announcement not found." });

        await announcement.destroy();
        res.json({ msg: "Announcement deleted." });
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

// EMPLOYER ADMIN
exports.getEmployerUsers = async (req, res) => {
    try {
        const users = await db.User.findAll({
            where: { role: "employer" },
            include: [{ model: db.EmployerProfile }],
            order: [["createdAt", "DESC"]]
        });

        const normalizeBusinessPermitPath = (value) => {
            const str = String(value || "").trim();
            if (!str) return str;

            // Preserve existing Cloudinary/object-storage references / http urls / already-correct /uploads/*.
            if (
                toSecureFileUrl(str) !== str &&
                (toSecureFileUrl(str).startsWith("/api/") || toSecureFileUrl(str).startsWith("cld:") || toSecureFileUrl(str).startsWith("http"))
            ) {
                return str;
            }
            if (str.startsWith("/uploads/")) return str;
            if (str.startsWith("cld:") || /^https?:\/\//i.test(str)) return str;

            // Convert Windows absolute paths like:
            // C:\...\uploads\documents\business_permit-123.pdf  => /uploads/documents/business_permit-123.pdf
            const winAbs = str.match(/^[A-Za-z]:\\.*\\uploads\\([^\\/]+)\\([^\\/]+)$/);
            if (winAbs) {
                const folder = String(winAbs[1] || "documents");
                const fileName = winAbs[2];
                return `/uploads/${folder}/${fileName}`;
            }

            // Convert file:///C:/.../uploads/documents/file.pdf => /uploads/documents/file.pdf
            const fileAbs = str.match(/^file:\/\/[A-Za-z]:\\.*\\uploads\\([^\\/]+)\\([^\\/]+)$/i);
            if (fileAbs) {
                const folder = String(fileAbs[1] || "documents");
                const fileName = fileAbs[2];
                return `/uploads/${folder}/${fileName}`;
            }

            return str;
        };

        res.json(
            users.map((user) => {
                const plain = user.toJSON ? user.toJSON() : { ...user };

                if (plain.EmployerProfile?.business_permit_path) {
                    const normalized = normalizeBusinessPermitPath(plain.EmployerProfile.business_permit_path);
                    plain.EmployerProfile.business_permit_path = toSecureFileUrl(normalized);
                }

                return plain;
            })
        );
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.updateEmployerUserStatus = async (req, res) => {
    try {
        const status = normalizeAccountStatus(req.body.status);
        if (!allowedAccountStatuses.includes(status)) {
            return res.status(400).json({ msg: "Invalid account status." });
        }

        const user = await db.User.findByPk(req.params.userId);
        if (!user || user.role !== "employer") {
            return res.status(404).json({ msg: "Employer user not found." });
        }

        user.account_status = status;
        await user.save();

        const [profile] = await db.EmployerProfile.findOrCreate({
            where: { user_id: user.id },
            defaults: { user_id: user.id }
        });

        if (status === "verified") profile.verified = true;
        if (status === "suspended" || status === "rejected" || status === "deactivated") profile.verified = false;
        await profile.save();

        if (status === "verified") {
            await notificationController.createNotification({
                userIds: [user.id],
                message: "Your employer account has been verified by DJEMC Employer Admin",
                subject: "DJEMC Employer Account Verified"
            });
        }

        const msg =
            status === "rejected"
                ? "Employer account rejected without deleting existing records."
                : "Employer account updated.";

        res.json({ msg, user, profile });
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

const createWarningNotification = async (req, res, role) => {
    try {
        const { userId, message } = req.body;
        if (!userId || !message) {
            return res.status(400).json({ msg: "userId and message are required." });
        }

        const user = await db.User.findByPk(userId);
        if (!user || user.role !== role) {
            return res.status(404).json({ msg: `${role} user not found.` });
        }

        await notificationController.createNotification({
            userIds: [user.id],
            message,
            subject: "Admin Warning",
            type: "warning"
        });

        return res.json({ msg: "Warning sent." });
    } catch (err) {
        return res.status(500).json({ msg: err.message });
    }
};

exports.createAlumniWarning = async (req, res) => createWarningNotification(req, res, "alumni");
exports.createEmployerWarning = async (req, res) => createWarningNotification(req, res, "employer");

exports.updateJobApprovalStatus = async (req, res) => {
    try {
        const approvalStatus = normalizeJobStatus(req.body.approval_status);
        if (!allowedJobStatuses.includes(approvalStatus)) {
            return res.status(400).json({ msg: "Invalid job approval status." });
        }

        const job = await db.Job.findByPk(req.params.jobId, {
            include: [{ model: db.User, attributes: ["id", "name", "email"] }]
        });
        if (!job) return res.status(404).json({ msg: "Job not found." });

        job.approval_status = approvalStatus;
        job.reviewed_by_admin_id = req.user.id;
        await job.save();

        // Notify employer about status update (approval status changed, not about new job)
        await notificationController.createNotification({
            userIds: [job.employer_id],
            message:
                approvalStatus === "approved"
                    ? `Your job "${job.title}" has been approved and is now visible to alumni.`
                    : `Your job "${job.title}" was marked as ${approvalStatus}.`,
            subject: "Job Post Review Update"
        });

        res.json({ msg: "Job approval status updated.", job });
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.deleteEmployerJob = async (req, res) => {
    try {
        const job = await db.Job.findByPk(req.params.jobId);
        if (!job) return res.status(404).json({ msg: "Job not found." });
        if (job.reviewed_by_admin_id !== req.user.id) {
            return res.status(403).json({ msg: "You can only remove jobs reviewed by your admin account." });
        }

        job.approval_status = "rejected";
        await job.save();

        res.json({ msg: "Job removed from listings without deleting application data.", job });
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};



