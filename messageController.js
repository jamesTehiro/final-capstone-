const fs = require("fs");
const path = require("path");
const { Op, fn, col, literal } = require("sequelize");
const db = require("../models");
const {
    destroyStoredFile,
    isStoredFileReference,
    sendStoredFile,
    getStoredFileOriginalName
} = require("../services/objectStorage");
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 30;
const fileExists = async (filePath) => {
    try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
};

const buildUserPayload = (user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    admin_scope: user.admin_scope || null,
    avatar_url: user.admin_avatar_url || user.AlumniProfile?.avatar_url || user.EmployerProfile?.logo_url || null,
    admin_avatar_url: user.admin_avatar_url || null,
    graduation_year: user.AlumniProfile?.graduation_year || null,
    course: user.AlumniProfile?.course || null,
    profile_visibility: user.AlumniProfile?.profile_visibility || "public"
});

const buildMessagePayload = (message) => ({
    id: message.id,
    conversation_id: message.conversation_id,
    sender_id: message.sender_id,
    message_text: message.message_text,
    message: message.message_text,
    file_url:
        message.file_url
            ? `/api/messages/files/${message.id}`
            : null,
    file_name: message.file_name,
    file_mime: message.file_mime,
    is_read: message.is_read,
    created_at: message.createdAt,
    createdAt: message.createdAt,
    sender: message.sender ? buildUserPayload(message.sender) : null
});

const slugify = (value = "") =>
    String(value)
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9_]/g, "")
        .toUpperCase();

const canAccessForum = (user) => {
    if (!user) return false;
    if (user.role === "alumni") return user.account_status === "verified";
    if (user.role === "admin") {
        return ["employer", "alumni"].includes(user.admin_scope || "");
    }
    return false;
};

const canAccessBatch = (user) =>
    user?.role === "alumni" &&
    user?.account_status === "verified" &&
    !!user?.AlumniProfile?.graduation_year &&
    !!user?.AlumniProfile?.course;

const getBatchConversationKey = (user) =>
    `${user.AlumniProfile.graduation_year}_${slugify(user.AlumniProfile.course)}`;

const canAccessCourse = (user) =>
    user?.role === "alumni" &&
    user?.account_status === "verified" &&
    !!user?.AlumniProfile?.course;

const getCourseConversationKey = (course) =>
    `course_${slugify(course)}`;

const getConversationDescriptors = (user) => {
    const descriptors = [];

    if (canAccessForum(user)) {
        descriptors.push({
            key: "forum_global",
            type: "forum",
            name: "Forum",
            subtitle: "Global alumni forum"
        });
    }

    if (canAccessCourse(user)) {
        descriptors.push({
            key: getCourseConversationKey(user.AlumniProfile.course),
            type: "course",
            name: `All ${user.AlumniProfile.course}`,
            subtitle: "Your course community",
            course: user.AlumniProfile.course
        });
    }

    if (canAccessBatch(user)) {
        descriptors.push({
            key: getBatchConversationKey(user),
            type: "batch",
            name: `${user.AlumniProfile.graduation_year} ${user.AlumniProfile.course}`,
            subtitle: "Your batch and course group",
            batch_year: user.AlumniProfile.graduation_year,
            course: user.AlumniProfile.course
        });
    }

    return descriptors;
};

const getUserWithProfiles = (userId) =>
    db.User.findByPk(userId, {
        include: [{ model: db.AlumniProfile }, { model: db.EmployerProfile }]
    });

const ensureConversation = async (descriptor) => {
    const [conversation] = await db.Conversation.findOrCreate({
        where: { conversation_key: descriptor.key },
        defaults: {
            conversation_key: descriptor.key,
            name: descriptor.name,
            type: descriptor.type,
            batch_year: descriptor.batch_year || null,
            course: descriptor.course || null,
            last_message_text: "",
            last_message_at: null
        }
    });

    const updates = {};
    if (conversation.name !== descriptor.name) updates.name = descriptor.name;
    if (conversation.type !== descriptor.type) updates.type = descriptor.type;
    if ((conversation.batch_year || null) !== (descriptor.batch_year || null)) {
        updates.batch_year = descriptor.batch_year || null;
    }
    if ((conversation.course || null) !== (descriptor.course || null)) {
        updates.course = descriptor.course || null;
    }
    if (Object.keys(updates).length) {
        await conversation.update(updates);
    }

    return conversation;
};

const ensureParticipant = async (conversationId, userId) =>
    db.ConversationParticipant.findOrCreate({
        where: {
            conversation_id: conversationId,
            user_id: userId
        },
        defaults: {
            conversation_id: conversationId,
            user_id: userId,
            last_read_at: new Date()
        }
    });

const getForumAudience = async () => {
    const users = await db.User.findAll({
        where: {
            [Op.or]: [
                { role: "alumni", account_status: "verified" },
                {
                    role: "admin",
                    admin_scope: {
                        [Op.in]: ["employer", "alumni"]
                    }
                }
            ]
        },
        attributes: ["id"]
    });
    return users.map((user) => user.id);
};

const getBatchAudience = async (conversation) => {
    const users = await db.User.findAll({
        where: {
            role: "alumni",
            account_status: "verified"
        },
        include: [
            {
                model: db.AlumniProfile,
                where: {
                    graduation_year: conversation.batch_year,
                    course: conversation.course
                },
                attributes: []
            }
        ],
        attributes: ["id"]
    });
    return users.map((user) => user.id);
};

const getCourseAudience = async (conversation) => {
    const users = await db.User.findAll({
        where: {
            role: "alumni",
            account_status: "verified"
        },
        include: [
            {
                model: db.AlumniProfile,
                where: {
                    course: conversation.course
                },
                attributes: []
            }
        ],
        attributes: ["id"]
    });
    return users.map((user) => user.id);
};

const assertConversationAccess = async (user, conversation) => {
    if (!conversation) {
        const err = new Error("Conversation not found.");
        err.status = 404;
        throw err;
    }

    if (conversation.type === "forum") {
        if (!canAccessForum(user)) {
            const err = new Error("You are not allowed to access the forum.");
            err.status = 403;
            throw err;
        }
        return;
    }

    if (conversation.type === "batch") {
        if (!canAccessBatch(user)) {
            const err = new Error("Only verified alumni can access batch conversations.");
            err.status = 403;
            throw err;
        }

        if (conversation.conversation_key !== getBatchConversationKey(user)) {
            const err = new Error("You can only access your own batch conversation.");
            err.status = 403;
            throw err;
        }
        return;
    }

    if (conversation.type === "course") {
        if (!canAccessCourse(user)) {
            const err = new Error("Only verified alumni can access course conversations.");
            err.status = 403;
            throw err;
        }

        if (conversation.conversation_key !== getCourseConversationKey(user.AlumniProfile.course)) {
            const err = new Error("You can only access your own course community.");
            err.status = 403;
            throw err;
        }
        return;
    }

    if (conversation.type === "direct") {
        // Check if user is a participant in this direct conversation
        const participant = await db.ConversationParticipant.findOne({
            where: {
                conversation_id: conversation.id,
                user_id: user.id
            }
        });
        if (!participant) {
            const err = new Error("You are not a participant in this conversation.");
            err.status = 403;
            throw err;
        }
        return;
    }

    const err = new Error("Unsupported conversation type.");
    err.status = 400;
    throw err;
};

const findConversationForLegacyRoom = async (user, room, batchYear) => {
    const descriptors = getConversationDescriptors(user);
    if (room === "global" || room === "forum" || room === "employer") {
        const forum = descriptors.find((item) => item.type === "forum");
        return forum ? ensureConversation(forum) : null;
    }

    if (room === "batch") {
        const batch = descriptors.find((item) => item.type === "batch");
        if (!batch) return null;
        if (batchYear && Number(batchYear) !== Number(batch.batch_year)) return null;
        return ensureConversation(batch);
    }

    if (room === "course") {
        const course = descriptors.find((item) => item.type === "course");
        if (!course) return null;
        return ensureConversation(course);
    }

    return null;
};

const getConversationByIdentifier = async (user, identifier) => {
    const normalized = String(identifier || "").trim();
    if (!normalized) return null;

    if (/^\d+$/.test(normalized)) {
        return db.Conversation.findByPk(Number(normalized));
    }

    return findConversationForLegacyRoom(user, normalized);
};

const markConversationAsReadForUser = async (conversationId, userId) => {
    await db.ConversationParticipant.update(
        {
            last_read_at: new Date()
        },
        {
            where: {
                conversation_id: conversationId,
                user_id: userId
            }
        }
    );
};

const getLatestMessageMap = async (conversationIds) => {
    if (!conversationIds.length) return new Map();

    const latestMessageRows = await db.Message.findAll({
        attributes: [[fn("MAX", col("id")), "id"]],
        where: {
            conversation_id: { [Op.in]: conversationIds }
        },
        group: ["conversation_id"],
        raw: true
    });

    const latestIds = latestMessageRows.map((row) => Number(row.id)).filter(Boolean);
    if (!latestIds.length) return new Map();

    const messages = await db.Message.findAll({
        where: { id: { [Op.in]: latestIds } },
        include: [
            {
                model: db.User,
                as: "sender",
                include: [{ model: db.AlumniProfile }, { model: db.EmployerProfile }]
            }
        ]
    });

    const map = new Map();
    messages.forEach((message) => {
        map.set(message.conversation_id, message);
    });
    return map;
};

const getUnreadCountMap = async (userId, participants = []) => {
    if (!participants.length) return new Map();

    // Build a single grouped query instead of N separate Message.count() calls
    const conversationIds = participants.map((p) => p.conversation_id);
    const lastReadMap = new Map(
        participants
            .filter((p) => p.last_read_at)
            .map((p) => [p.conversation_id, p.last_read_at])
    );

    // Single query: count unread messages grouped by conversation_id
    const where = {
        conversation_id: { [Op.in]: conversationIds },
        sender_id: { [Op.ne]: userId }
    };

    // Apply per-conversation last_read_at filter via raw OR conditions
    if (lastReadMap.size > 0) {
        where[Op.or] = conversationIds.map((cid) => {
            const lr = lastReadMap.get(cid);
            if (lr) {
                return {
                    [Op.and]: [
                        { conversation_id: cid },
                        { createdAt: { [Op.gt]: lr } }
                    ]
                };
            }
            return { conversation_id: cid };
        });
    }

    const results = await db.Message.findAll({
        attributes: ["conversation_id", [fn("COUNT", col("id")), "unread_count"]],
        where,
        group: ["conversation_id"],
        raw: true
    });

    const map = new Map();
    // Initialize all conversations with 0, then fill in actual counts
    conversationIds.forEach((cid) => map.set(cid, 0));
    results.forEach((row) => {
        map.set(row.conversation_id, Number(row.unread_count));
    });
    return map;
};

exports.getAccessibleConversations = async (req, res, next) => {
    try {
        const user = await getUserWithProfiles(req.user.id);
        if (!user) return res.status(401).json({ msg: "Unauthorized" });

        const descriptors = getConversationDescriptors(user);
        const conversations = [];
        for (const descriptor of descriptors) {
            const conversation = await ensureConversation(descriptor);
            await ensureParticipant(conversation.id, user.id);
            conversations.push(conversation);
        }

        // DEBUG: trace each ensured conversation
        console.log("[TRACE] Descriptors count:", descriptors.length, "types:", descriptors.map(d => d.type));
        console.log("[TRACE] Ensured conversations count:", conversations.length, "types:", conversations.map(c => c.type));

        const directParticipants = await db.ConversationParticipant.findAll({
            where: { user_id: user.id },
            include: [{
                model: db.Conversation,
                where: { type: "direct" }
            }]
        });

        const directConversations = directParticipants
            .filter((p) => p.Conversation)
            .map((p) => p.Conversation);

        const allConversations = [...conversations, ...directConversations];

        const participants = await db.ConversationParticipant.findAll({
            where: {
                user_id: user.id,
                conversation_id: allConversations.map((item) => item.id)
            },
            include: [{ model: db.Conversation }]
        });

        const latestMessageMap = await getLatestMessageMap(allConversations.map((item) => item.id));
        const unreadCountMap = await getUnreadCountMap(user.id, participants);

        const participantUsers = await db.ConversationParticipant.findAll({
            where: {
                conversation_id: allConversations.map((item) => item.id)
            },
            include: [{
                model: db.User,
                include: [{ model: db.AlumniProfile }, { model: db.EmployerProfile }]
            }]
        });

        const participantMap = new Map();
        participantUsers.forEach((p) => {
            if (!participantMap.has(p.conversation_id)) {
                participantMap.set(p.conversation_id, []);
            }
            participantMap.get(p.conversation_id).push(p.User);
        });

        return res.json(
            participants
                .map((participant) => {
                    const conversation = participant.Conversation;
                    const latestMessage = latestMessageMap.get(conversation.id);
                    const preview = latestMessage?.message_text
                        ? latestMessage.message_text
                        : latestMessage?.file_name
                            ? `Attachment: ${latestMessage.file_name}`
                            : conversation.last_message_text || conversation.name;

                    let participantAvatarUrl = null;
                    if (conversation.type === "direct") {
                        const usersInConvo = participantMap.get(conversation.id) || [];
                        const otherUser = usersInConvo.find((u) => u.id !== req.user.id);
                        if (otherUser) {
                            participantAvatarUrl = buildUserPayload(otherUser).avatar_url;
                        }
                    }

                    return {
                        id: conversation.id,
                        conversation_key: conversation.conversation_key,
                        name: conversation.name,
                        type: conversation.type,
                        batch_year: conversation.batch_year,
                        course: conversation.course,
                        unread_count: unreadCountMap.get(conversation.id) || 0,
                        last_message_preview: preview,
                        last_message_at: conversation.last_message_at || latestMessage?.createdAt || null,
                        participant_avatar_url: participantAvatarUrl
                    };
                })
                .sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0))
        );
    } catch (err) {
        return next(err);
    }
};

exports.getConversationMessages = async (req, res, next) => {
    try {
        const user = await getUserWithProfiles(req.user.id);
        const conversation = await getConversationByIdentifier(user, req.params.conversationId);
        await assertConversationAccess(user, conversation);
        await ensureParticipant(conversation.id, user.id);

        const limit = Math.min(Number(req.query.limit) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
        const before = Number(req.query.before) || null;
        const where = { conversation_id: conversation.id };
        if (before) where.id = { [Op.lt]: before };

        const messages = await db.Message.findAll({
            where,
            include: [
                {
                    model: db.User,
                    as: "sender",
                    include: [{ model: db.AlumniProfile }, { model: db.EmployerProfile }]
                }
            ],
            order: [["id", "DESC"]],
            limit
        });

        return res.json({
            conversation: {
                id: conversation.id,
                name: conversation.name,
                type: conversation.type,
                conversation_key: conversation.conversation_key
            },
            messages: [...messages].reverse().map(buildMessagePayload),
            has_more: messages.length === limit
        });
    } catch (err) {
        return next(err);
    }
};

exports.markConversationAsRead = async (req, res, next) => {
    try {
        const user = await getUserWithProfiles(req.user.id);
        const conversation = await db.Conversation.findByPk(Number(req.params.conversationId));
        await assertConversationAccess(user, conversation);
        await ensureParticipant(conversation.id, user.id);
        await markConversationAsReadForUser(conversation.id, user.id);
        return res.json({ msg: "Conversation marked as read." });
    } catch (err) {
        return next(err);
    }
};

exports.searchEligibleUsers = async (req, res, next) => {
    try {
        console.log("[SEARCH USERS]", req.query.q);
        const user = await getUserWithProfiles(req.user.id);
        if (!user) return res.status(401).json({ msg: "Unauthorized" });

        const query = String(req.query.q || "").trim();
        if (!query || query.length < 2) {
            return res.json([]);
        }

        // Determine who this user can message based on role
        const conditions = [];

        if (user.role === "alumni") {
            // Alumni can message other alumni and employers
            conditions.push(
                { role: "alumni", account_status: "verified" },
                { role: "employer" }
            );
        } else if (user.role === "employer") {
            // Employers can message alumni and admin
            conditions.push(
                { role: "alumni", account_status: "verified" },
                { role: "admin", admin_scope: "employer" }
            );
        } else if (user.role === "admin") {
            // Admins can message based on scope
            if (user.admin_scope === "alumni") {
                conditions.push(
                    { role: "alumni" },
                    { role: "employer" },
                    { role: "admin" }
                );
            } else if (user.admin_scope === "employer") {
                conditions.push(
                    { role: "employer" },
                    { role: "admin" },
                    { role: "alumni" }
                );
            }
        }

        if (conditions.length === 0) {
            return res.json([]);
        }

        const normalizedQuery = query.toLowerCase();
        const users = await db.User.findAll({
            where: {
                [Op.or]: conditions.map((condition) => ({
                    ...condition,
                    [Op.and]: [
                        { id: { [Op.ne]: user.id } },
                        {
                            [Op.or]: [
                                db.sequelize.where(fn("LOWER", col("name")), {
                                    [Op.like]: `%${normalizedQuery}%`
                                }),
                                db.sequelize.where(fn("LOWER", col("email")), {
                                    [Op.like]: `%${normalizedQuery}%`
                                })
                            ]
                        }
                    ]
                }))
            },
            include: [
                { model: db.AlumniProfile, attributes: ["graduation_year", "course", "avatar_url", "profile_visibility"] },
                { model: db.EmployerProfile, attributes: ["organization_name", "logo_url"] }
            ],
            attributes: ["id", "name", "email", "role"],
            limit: 20
        });

        return res.json(users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            avatar_url: u.AlumniProfile?.avatar_url || u.EmployerProfile?.logo_url || null,
            organization_name: u.EmployerProfile?.organization_name || null,
            graduation_year: u.AlumniProfile?.graduation_year || null,
            course: u.AlumniProfile?.course || null
        })));
    } catch (err) {
        return next(err);
    }
};

exports.createOrGetDirectConversation = async (req, res, next) => {
    try {
        const user = await getUserWithProfiles(req.user.id);
        if (!user) return res.status(401).json({ msg: "Unauthorized" });

        const targetUserId = Number(req.body.targetUserId || req.params.targetUserId);
        if (!targetUserId || targetUserId === user.id) {
            return res.status(400).json({ msg: "Invalid target user." });
        }

        const targetUser = await db.User.findByPk(targetUserId, {
            include: [{ model: db.AlumniProfile }, { model: db.EmployerProfile }]
        });
        if (!targetUser) {
            return res.status(404).json({ msg: "Target user not found." });
        }

        // Generate a deterministic conversation key for direct messages
        const userIds = [user.id, targetUserId].sort((a, b) => a - b);
        const conversationKey = `direct_${userIds[0]}_${userIds[1]}`;

        // Find or create the direct conversation
        let conversation = await db.Conversation.findOne({
            where: { conversation_key: conversationKey }
        });

        if (!conversation) {
            conversation = await db.Conversation.create({
                conversation_key: conversationKey,
                name: `Direct: ${user.name} & ${targetUser.name}`,
                type: "direct",
                user1Id: userIds[0],
                user2Id: userIds[1],
                last_message_text: "",
                last_message_at: null
            });

            // Add both users as participants
            await db.ConversationParticipant.bulkCreate([
                { conversation_id: conversation.id, user_id: user.id, last_read_at: new Date() },
                { conversation_id: conversation.id, user_id: targetUserId, last_read_at: new Date() }
            ], { ignoreDuplicates: true });
        } else {
            // Ensure current user is a participant
            await db.ConversationParticipant.findOrCreate({
                where: { conversation_id: conversation.id, user_id: user.id },
                defaults: { conversation_id: conversation.id, user_id: user.id, last_read_at: new Date() }
            });
        }

        return res.json({
            id: conversation.id,
            conversation_key: conversation.conversation_key,
            name: conversation.name,
            type: conversation.type,
            user1Id: conversation.user1Id,
            user2Id: conversation.user2Id,
            last_message_text: conversation.last_message_text,
            last_message_at: conversation.last_message_at
        });
    } catch (err) {
        return next(err);
    }
};

exports.sendConversationMessage = async (req, res, next) => {
    try {
        const user = await getUserWithProfiles(req.user.id);
        const conversation = await getConversationByIdentifier(user, req.params.conversationId);
        await assertConversationAccess(user, conversation);
        await ensureParticipant(conversation.id, user.id);

        // DEBUG: Log conversation details
        console.log("[COURSE_DEBUG] sendConversationMessage - Conversation ID:", conversation.id);
        console.log("[COURSE_DEBUG] sendConversationMessage - Conversation Type:", conversation.type);
        console.log("[COURSE_DEBUG] sendConversationMessage - Sender ID:", user.id);
        console.log("[COURSE_DEBUG] sendConversationMessage - Sender Course:", user.AlumniProfile?.course);

        // For course conversations, ensure ALL alumni with the same course are participants
        if (conversation.type === "course") {
            const courseAudience = await getCourseAudience(conversation);
            console.log("[COURSE_DEBUG] sendConversationMessage - Course audience user IDs:", courseAudience);
            for (const audienceUserId of courseAudience) {
                await ensureParticipant(conversation.id, audienceUserId);
            }
            // Verify participants after sync
            const allParticipants = await db.ConversationParticipant.findAll({
                where: { conversation_id: conversation.id },
                attributes: ["user_id"]
            });
            console.log("[COURSE_DEBUG] sendConversationMessage - Total participants after sync:", allParticipants.length);
            console.log("[COURSE_DEBUG] sendConversationMessage - Participant User IDs:", allParticipants.map(p => p.user_id));
        }

        // For batch conversations, ensure ALL alumni with the same batch+course are participants
        if (conversation.type === "batch") {
            const batchAudience = await getBatchAudience(conversation);
            console.log("[COURSE_DEBUG] sendConversationMessage - Batch audience user IDs:", batchAudience);
            for (const audienceUserId of batchAudience) {
                await ensureParticipant(conversation.id, audienceUserId);
            }
        }

        const messageText = String(req.body.message_text || req.body.message || "").trim();
        const attachment = req.file || null;
        if (!messageText && !attachment) {
            return res.status(400).json({ msg: "Message text or attachment is required." });
        }

        const storedAttachment = attachment
            ? attachment.storageRef || attachment.path || `/api/messages/files/${path.basename(attachment.filename)}`
            : null;

        const messagePayload = {
            conversation_id: conversation.id,
            sender_id: user.id,
            message_text: messageText,
            file_url: storedAttachment,
            file_name: attachment?.originalname || null,
            file_mime: attachment?.mimetype || null,
            is_read: false
        };

        const created = await db.Message.create(messagePayload);

        // DEBUG: Log message creation
        console.log("[COURSE_DEBUG] sendConversationMessage - Message ID after insert:", created.id);

        await conversation.update({
            last_message_text: messageText || attachment?.originalname || "Attachment",
            last_message_at: created.createdAt
        });

        // ---- SOCKET.IO BROADCAST ----
        try {
            const io = req.app.get("io");
            if (io) {
                const room = `conversation:${conversation.id}`;

                // Get total participants
                const allParticipants = await db.ConversationParticipant.findAll({
                    where: { conversation_id: conversation.id },
                    attributes: ["user_id"]
                });
                const totalParticipants = allParticipants.length;
                const participantUserIds = allParticipants.map(p => p.user_id);

                // Get connected sockets in room
                const roomSockets = io.sockets.adapter.rooms.get(room);
                const connectedCount = roomSockets ? roomSockets.size : 0;
                const socketIds = roomSockets ? Array.from(roomSockets) : [];

                // Map socket IDs to user IDs
                const socketToUserMap = [];
                for (const sid of socketIds) {
                    const s = io.sockets.sockets.get(sid);
                    if (s && s.userId) {
                        socketToUserMap.push({ socketId: sid, userId: s.userId });
                    }
                }

                const messagePayload = buildMessagePayload({
                    ...created.toJSON(),
                    sender: user
                });

                console.log("=== SOCKET BROADCAST ===");
                console.log("  Conversation ID:", conversation.id);
                console.log("  Conversation type:", conversation.type);
                console.log("  Sender ID:", user.id);
                console.log("  Sender course:", user.AlumniProfile?.course || "N/A");
                console.log("  Total ConversationParticipants:", totalParticipants);
                console.log("  Participant User IDs:", participantUserIds.join(", "));
                console.log("  Connected sockets in room:", connectedCount);
                console.log("  Socket IDs in room:", socketIds.join(", "));
                console.log("  Socket-to-User map:", JSON.stringify(socketToUserMap));
                console.log("  Broadcast emitted:", connectedCount > 0 ? "YES" : "NO (empty room)");

                io.to(room).emit("new-message", messagePayload);
                console.log("  Emit completed");
            } else {
                console.log("[COURSE_DEBUG] sendConversationMessage - io not available on app");
            }
        } catch (socketErr) {
            console.error("[COURSE_DEBUG] sendConversationMessage - Socket broadcast error:", socketErr.message);
        }

        // Attach sender directly from already-fetched user to avoid redundant findByPk
        const messageWithSender = {
            ...created.toJSON(),
            sender: user
        };

        return res.status(201).json(buildMessagePayload(messageWithSender));
    } catch (err) {
        return next(err);
    }
};

exports.sendLegacyRoomMessage = async (req, res, next) => {
    try {
        const user = await getUserWithProfiles(req.user.id);
        const conversation = await findConversationForLegacyRoom(user, req.body.room, req.body.batch_year);
        if (!conversation) {
            return res.status(403).json({ msg: "You are not allowed to access that room." });
        }
        req.params.conversationId = String(conversation.id);
        return exports.sendConversationMessage(req, res, next);
    } catch (err) {
        return next(err);
    }
};

exports.getLegacyRoomMessages = async (req, res, next) => {
    try {
        const user = await getUserWithProfiles(req.user.id);
        const conversation = await findConversationForLegacyRoom(user, req.params.room, req.params.year);
        if (!conversation) {
            return res.status(403).json({ msg: "You are not allowed to access that room." });
        }
        req.params.conversationId = String(conversation.id);
        const payload = await new Promise((resolve, reject) => {
            const fakeRes = {
                json: resolve
            };
            exports.getConversationMessages(req, fakeRes, reject);
        });
        return res.json(payload.messages || []);
    } catch (err) {
        return next(err);
    }
};

exports.deleteMessage = async (req, res, next) => {
    try {
        const user = await getUserWithProfiles(req.user.id);
        const conversation = await getConversationByIdentifier(user, req.params.conversationId);
        await assertConversationAccess(user, conversation);

        const message = await db.Message.findOne({
            where: {
                id: Number(req.params.messageId),
                conversation_id: conversation.id
            }
        });

        if (!message) return res.status(404).json({ msg: "Message not found." });

        if (message.sender_id !== user.id && user.role !== "admin") {
            return res.status(403).json({ msg: "You are not allowed to delete this message." });
        }

        if (message.file_url) {
            if (isStoredFileReference(message.file_url)) {
                await destroyStoredFile(message.file_url);
            } else if (/^https?:\/\//i.test(String(message.file_url || ""))) {
                // Public remote assets do not have a local file to delete.
            } else {
                const fileName = path.basename(message.file_url);
                const resolvedFilePath =
                    path.join(__dirname, "..", "private_uploads", "chat", fileName);
                if (await fileExists(resolvedFilePath)) {
                    await fs.promises.unlink(resolvedFilePath);
                }
            }
        }

        await message.destroy();

        // Fetch only the fields needed for the conversation update (lighter query)
        const latest = await db.Message.findOne({
            where: { conversation_id: conversation.id },
            attributes: ["message_text", "file_name", "createdAt"],
            order: [["id", "DESC"]]
        });

        await conversation.update({
            last_message_text: latest?.message_text || latest?.file_name || "",
            last_message_at: latest?.createdAt || null
        });

        return res.json({ msg: "Message deleted." });
    } catch (err) {
        return next(err);
    }
};

exports.downloadMessageFile = async (req, res, next) => {
    try {
        const identifier = String(req.params.fileName || "").trim();
        const fileName = path.basename(identifier);
        const message = /^\d+$/.test(identifier)
            ? await db.Message.findByPk(Number(identifier))
            : await db.Message.findOne({
                where: {
                    file_url: { [Op.like]: `%/${fileName}` }
                }
            });

        if (!message) return res.status(404).json({ msg: "File not found." });

        const user = await getUserWithProfiles(req.user.id);
        const conversation = await db.Conversation.findByPk(message.conversation_id);
        await assertConversationAccess(user, conversation);

        if (isStoredFileReference(message.file_url) || /^https?:\/\//i.test(String(message.file_url || ""))) {
            return sendStoredFile(
                message.file_url,
                res,
                message.file_name || getStoredFileOriginalName(message.file_url) || fileName
            );
        }

        const resolvedFilePath =
            path.join(__dirname, "..", "private_uploads", "chat", fileName);
        if (!(await fileExists(resolvedFilePath))) {
            return res.status(404).json({ msg: "Stored file not found." });
        }

        return res.download(resolvedFilePath, message.file_name || fileName);
    } catch (err) {
        return next(err);
    }
};