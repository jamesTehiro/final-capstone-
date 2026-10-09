const db = require("../models");
const notificationController = require("./notificationController");

exports.getPendingAlumniUsers = async (_req, res) => {
    try {
        const users = await db.User.findAll({
            where: { role: "alumni", account_status: "pending" },
            include: [{ model: db.AlumniProfile }],
            order: [["createdAt", "DESC"]]
        });

        const serialized = users.map((user) => {
            const profile = user.AlumniProfile ? user.AlumniProfile.toJSON() : {};
            if (profile.proof_document_path) {
                const token = Buffer.from(String(profile.proof_document_path), "utf8").toString("base64url");
                profile.proof_document_url = `/api/files/secure/${token}`;
                profile.has_proof_document = true;
                profile.proof_document_name = String(profile.proof_document_path).split("/").pop() || "proof-document";
            } else {
                profile.proof_document_url = null;
                profile.has_proof_document = false;
                profile.proof_document_name = null;
            }
            return { ...user.toJSON(), AlumniProfile: profile };
        });

        res.json(serialized);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.approveAlumniUser = async (req, res) => {
    try {
        const { alumni_record_id, student_id, course, batch_year, full_name } = req.body;

        let record = null;
        if (alumni_record_id) {
            record = await db.AlumniRecord.findByPk(alumni_record_id);
        }

        if (!record && student_id) {
            record = await db.AlumniRecord.findOne({
                where: { student_id: String(student_id).trim() }
            });
        }

        if (!record && full_name) {
            record = await db.AlumniRecord.findOne({
                where: { full_name: String(full_name).trim() }
            });
        }

        if (!record && course && batch_year) {
            record = await db.AlumniRecord.findOne({
                where: { course, batch_year }
            });
        }

        if (!record) {
            return res.status(400).json({ msg: "Matching alumni record not found." });
        }

        const user = await db.User.findByPk(req.params.id);
        if (!user || user.role !== "alumni") {
            return res.status(404).json({ msg: "Alumni user not found." });
        }

        user.account_status = "verified";
        user.alumni_record_id = record.id;
        await user.save();

        await notificationController.createNotification({
            userIds: [user.id],
            message: "Your account has been verified as an alumnus of DJEMC",
            subject: "DJEMC Alumni Account Verified"
        });

        res.json({ msg: "Alumni user approved.", user });
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.rejectAlumniUser = async (req, res) => {
    try {
        const user = await db.User.findByPk(req.params.id);
        if (!user || user.role !== "alumni") {
            return res.status(404).json({ msg: "Alumni user not found." });
        }

        user.account_status = "rejected";
        await user.save();

        res.json({ msg: "Alumni user rejected without deleting account history.", user });
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.getAnalytics = async (req, res) => {
    try {
        const totalAlumni = await db.User.count({ where: { role: "alumni" } });
        const activeAlumni = await db.User.count({ where: { role: "alumni", account_status: "verified" } });
        const totalEmployers = await db.User.count({ where: { role: "employer" } });
        const activeEmployers = await db.User.count({ where: { role: "employer", account_status: "verified" } });
        const totalJobs = await db.Job.count();
        const totalApplications = await db.Application.count();

        const employedAlumni = await db.AlumniProfile.count({ where: { employment_status: "employed" } });
        const unemployedAlumni = await db.AlumniProfile.count({ where: { employment_status: "unemployed" } });
        const selfEmployedAlumni = await db.AlumniProfile.count({ where: { employment_status: "self-employed" } });

        const employmentTotal = employedAlumni + unemployedAlumni + selfEmployedAlumni;
        const employmentRate = employmentTotal > 0 ? Math.round((employedAlumni / employmentTotal) * 100) : 0;

        res.json({
            totalAlumni,
            activeAlumni,
            totalEmployers,
            activeEmployers,
            totalJobs,
            totalApplications,
            employedAlumni,
            unemployedAlumni,
            selfEmployedAlumni,
            employmentRate
        });
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};
