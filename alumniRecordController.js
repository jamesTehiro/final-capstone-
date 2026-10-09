const { Op } = require("sequelize");
const db = require("../models");

exports.getAlumniRecords = async (_req, res) => {
    try {
        // Official Master List hierarchy (Course → Batch → Students)
        // Source of truth: AlumniRecord only (course, batch_year, full_name)
        // Overlays: AlumniProfile (address, employment_status, current_company, job_title)

        const records = await db.AlumniRecord.findAll({
            attributes: ["id", "full_name", "student_id", "course", "batch_year", "createdAt"],
            include: [
                {
                    model: db.User,
                    required: false,
                    attributes: ["id", "account_status"],
                    include: [
                        {
                            model: db.AlumniProfile,
                            required: false,
                            attributes: ["employment_status", "current_company", "job_title", "address"]
                        }
                    ]
                }
            ],
            order: [["course", "ASC"], ["batch_year", "DESC"], ["full_name", "ASC"]]
        });

        console.log("[ALUMNI_RECORDS]", records.length, "records payload", records.slice(0, 2));
        res.json(records);
    } catch (err) {
        console.error("[GET_ALUMNI_RECORDS_ERR]", err);
        res.status(500).json({ msg: err.message });
    }
};

exports.searchAlumniRecords = async (req, res) => {
    try {
        const name = String(req.query.name || "").trim();
        if (!name) return res.json([]);

        const where = {
            [Op.or]: [
                { full_name: { [Op.like]: `%${name}%` } },
                { course: { [Op.like]: `%${name}%` } }
            ]
        };

        const batchYear = Number(name);
        if (!Number.isNaN(batchYear)) {
            where[Op.or].push({ batch_year: batchYear });
        }

        const records = await db.AlumniRecord.findAll({
            where,
            attributes: ["id", "full_name", "course", "batch_year"],
            include: [
                {
                    model: db.User,
                    required: false,
                    attributes: ["id"],
                    include: [
                        {
                            model: db.AlumniProfile,
                            required: false,
                            attributes: ["address"]
                        }
                    ]
                }
            ],
            order: [["full_name", "ASC"]],
            limit: 25
        });

        res.json(records);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};


exports.createAlumniRecord = async (req, res) => {
    try {
        const { full_name, student_id, course, batch_year, email } = req.body;
        if (!full_name || !course || !batch_year) {
            return res.status(400).json({ msg: "Full name, course, and batch year are required." });
        }

        // Duplicate prevention: Priority 1 - Check student_id (strict unique)
        if (student_id) {
            const existingByStudentId = await db.AlumniRecord.findOne({
                where: { student_id: String(student_id).trim() }
            });
            if (existingByStudentId) {
                return res.status(409).json({
                    success: false,
                    message: "Alumni record already exists."
                });
            }
        }

        // Duplicate prevention: Priority 2 - Check email (case-insensitive unique)
        if (email) {
            const existingByEmail = await db.AlumniRecord.findOne({
                where: {
                    email: { [Op.like]: email.trim() }
                }
            });
            if (existingByEmail) {
                return res.status(409).json({
                    success: false,
                    message: "Alumni record already exists."
                });
            }
        }

        // Duplicate prevention: Priority 3 - Check full_name + course + batch_year (fallback)
        const existingByCombination = await db.AlumniRecord.findOne({
            where: {
                full_name: String(full_name).trim(),
                course: String(course).trim(),
                batch_year: Number(batch_year)
            }
        });
        if (existingByCombination) {
            return res.status(409).json({
                success: false,
                message: "Alumni record already exists."
            });
        }

        const record = await db.AlumniRecord.create({
            full_name,
            student_id: student_id || null,
            course,
            batch_year,
            email: email || null
        });

        // Fetch the created record with overlays to match getAlumniRecords response format
        const createdWithOverlays = await db.AlumniRecord.findByPk(record.id, {
            attributes: ["id", "full_name", "student_id", "course", "batch_year", "createdAt"],
            include: [
                {
                    model: db.User,
                    required: false,
                    attributes: ["id", "account_status"],
                    include: [
                        {
                            model: db.AlumniProfile,
                            required: false,
                            attributes: ["employment_status", "current_company", "job_title", "address"]
                        }
                    ]
                }
            ]
        });

        res.status(201).json(createdWithOverlays);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.deleteAlumniRecord = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || isNaN(Number(id))) {
            return res.status(400).json({ msg: "Valid alumni record ID is required." });
        }

        const record = await db.AlumniRecord.findByPk(Number(id));
        if (!record) {
            return res.status(404).json({ msg: "Alumni record not found." });
        }

        await record.destroy();

        console.log("[DELETE_ALUMNI_RECORD] Deleted record ID:", id);
        res.json({ success: true, msg: "Alumni record deleted successfully." });
    } catch (err) {
        console.error("[DELETE_ALUMNI_RECORD_ERR]", err);
        res.status(500).json({ msg: err.message });
    }
};