const db = require("../models");
const auditService = require("../services/auditService");

// GET /api/requirements/library
exports.getLibrary = async (req, res) => {
    try {
        const where = { is_active: true };
        if (req.query.category) {
            where.category = req.query.category;
        }

        const items = await db.RequirementLibrary.findAll({
            where,
            order: [
                ["category", "ASC"],
                ["sort_order", "ASC"]
            ]
        });

        // Group by category
        const grouped = {};
        for (const item of items) {
            const cat = item.category;
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(item);
        }

        res.json({
            grouped,
            all: items
        });
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

// GET /api/requirements/library/:code
exports.getLibraryByCode = async (req, res) => {
    try {
        const item = await db.RequirementLibrary.findOne({
            where: { requirement_code: req.params.code, is_active: true }
        });
        if (!item) return res.status(404).json({ msg: "Requirement not found." });
        res.json(item);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

// Helper to generate a unique code for custom requirements
const generateCustomCode = () => {
    return `custom_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
};