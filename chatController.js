const { Op } = require("sequelize");
const db = require("../models");

exports.searchUsers = async (req, res) => {
    try {
        const q = (req.query.q || "").trim();
        const where = {
            id: { [Op.ne]: req.user.id }
        };

        if (q) {
            where[Op.or] = [
                { name: { [Op.like]: `%${q}%` } },
                { email: { [Op.like]: `%${q}%` } },
                { role: { [Op.like]: `%${q}%` } }
            ];
        }

        const users = await db.User.findAll({
            where,
            attributes: ["id", "name", "email", "role"],
            order: [["name", "ASC"]],
            limit: 25
        });

        res.json(users);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.getConversations = async (req, res) => {
    try {
        const conversations = await db.Conversation.findAll({
            where: {
                [Op.or]: [{ user1Id: req.user.id }, { user2Id: req.user.id }]
            },
            order: [["updatedAt", "DESC"]]
        });

        const partnerIds = [...new Set(conversations.map((c) =>
            c.user1Id === req.user.id ? c.user2Id : c.user1Id
        ))];

        const users = await db.User.findAll({
            where: { id: partnerIds },
            attributes: ["id", "name", "email", "role"]
        });

        const userMap = new Map(users.map((u) => [u.id, u]));

        const result = conversations.map((c) => {
            const partnerId = c.user1Id === req.user.id ? c.user2Id : c.user1Id;
            return {
                ...c.toJSON(),
                partner: userMap.get(partnerId) || null
            };
        });

        res.json(result);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.createConversation = async (req, res) => {
    try {
        const { user2Id } = req.body;

        if (!user2Id) return res.status(400).json({ msg: "user2Id is required" });
        if (Number(user2Id) === req.user.id) return res.status(400).json({ msg: "Cannot chat with yourself" });

        const target = await db.User.findByPk(user2Id, { attributes: ["id", "name", "email", "role"] });
        if (!target) return res.status(404).json({ msg: "User not found" });

        let conversation = await db.Conversation.findOne({
            where: {
                [Op.or]: [
                    { user1Id: req.user.id, user2Id: Number(user2Id) },
                    { user1Id: Number(user2Id), user2Id: req.user.id }
                ]
            }
        });

        if (!conversation) {
            conversation = await db.Conversation.create({
                user1Id: req.user.id,
                user2Id: Number(user2Id)
            });
        }

        res.json({
            ...conversation.toJSON(),
            partner: target
        });
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.sendMessage = async (req, res) => {
    try {
        const { conversationId, message } = req.body;
        if (!conversationId || !message?.trim()) {
            return res.status(400).json({ msg: "conversationId and message are required" });
        }

        const conversation = await db.Conversation.findByPk(conversationId);
        if (!conversation) return res.status(404).json({ msg: "Conversation not found" });

        const isMember = conversation.user1Id === req.user.id || conversation.user2Id === req.user.id;
        if (!isMember) return res.status(403).json({ msg: "Forbidden" });

        const msg = await db.Message.create({
            conversation_id: Number(conversationId),
            sender_id: req.user.id,
            message_text: message.trim()
        });

        await conversation.update({ updatedAt: new Date() });

        res.json(msg);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.getMessages = async (req, res) => {
    try {
        const conversationId = Number(req.params.conversation_id);
        const conversation = await db.Conversation.findByPk(conversationId);
        if (!conversation) return res.status(404).json({ msg: "Conversation not found" });

        const isMember = conversation.user1Id === req.user.id || conversation.user2Id === req.user.id;
        if (!isMember) return res.status(403).json({ msg: "Forbidden" });

        const messages = await db.Message.findAll({
            where: { conversation_id: conversationId },
            order: [["createdAt", "ASC"]]
        });

        res.json(messages);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.deleteConversation = async (req, res) => {
    try {
        const conversationId = Number(req.params.id);
        const conversation = await db.Conversation.findByPk(conversationId);
        if (!conversation) return res.status(404).json({ msg: "Conversation not found" });

        const isMember = conversation.user1Id === req.user.id || conversation.user2Id === req.user.id;
        if (!isMember) return res.status(403).json({ msg: "Forbidden" });

        await db.Message.destroy({ where: { conversation_id: conversationId } });
        await conversation.destroy();

        res.json({ msg: "Conversation deleted" });
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};
