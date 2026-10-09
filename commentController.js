const db = require("../models");

// CREATE COMMENT
exports.createComment = async (req, res) => {
    try {
        const { announcement_id, comment } = req.body;
        const newComment = await db.Comment.create({
            announcement_id,
            user_id: req.user.id,
            comment
        });
        res.json(newComment);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

// GET COMMENTS BY ANNOUNCEMENT
exports.getCommentsByAnnouncement = async (req, res) => {
    try {
        const comments = await db.Comment.findAll({
            where: { announcement_id: req.params.announcement_id },
            include: [{ model: db.User, attributes: ["id", "name"] }]
        });
        res.json(comments);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};