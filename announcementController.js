const db = require("../models");
const notificationController = require("./notificationController");

// CREATE ANNOUNCEMENT (admin only)
exports.createAnnouncement = async (req, res) => {
    try {
        const { title, content, target_year } = req.body;
        if (!title || !content) {
            return res.status(400).json({ msg: "Title and content are required." });
        }

        const announcement = await db.Announcement.create({
            title,
            content,
            admin_id: req.user.id
        });

        const targetYearValue = (target_year || "").trim();
        let yearFilter = null;
        if (targetYearValue) {
            const parsedYear = Number(targetYearValue);
            if (Number.isNaN(parsedYear)) {
                return res.status(400).json({ msg: "Target graduation year must be numeric." });
            }
            yearFilter = parsedYear;
        }

        const alumniWhere = { role: "alumni" };
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
                subject: "New Announcement from DJEMC Admin"
            });
        }

        res.json(announcement);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

// GET ALL ANNOUNCEMENTS
exports.getAnnouncements = async (req, res) => {
    try {
        const announcements = await db.Announcement.findAll({
            include: [
                {
                    model: db.User,
                    as: "admin",
                    attributes: ["id", "name", "role", "admin_scope", "admin_avatar_url"]
                },
                { model: db.Comment }
            ]
        });
        res.json(announcements);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};
