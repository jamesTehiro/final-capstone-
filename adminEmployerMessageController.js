const fs = require("fs");
const path = require("path");
const db = require("../models");
const {
    destroyStoredFile,
    isStoredFileReference,
    sendStoredFile,
    getStoredFileOriginalName
} = require("../services/objectStorage");

const attachmentsRoot = path.join(__dirname, "..", "private_uploads", "admin_employer");
const MAX_PAGE_SIZE = Number(process.env.ADMIN_EMPLOYER_MAX_PAGE_SIZE || 100);
const DEFAULT_PAGE_SIZE = Number(process.env.ADMIN_EMPLOYER_PAGE_SIZE || 25);

const toAttachmentUrl = (messageOrStoredPath) => {
    if (!messageOrStoredPath) return null;
    if (typeof messageOrStoredPath === "object" && messageOrStoredPath.id) {
        return `/api/admin-employer/messages/files/${messageOrStoredPath.id}`;
    }
    return `/api/admin-employer/messages/files/${path.basename(String(messageOrStoredPath || ""))}`;
};

const isEmployerAdmin = (user) => user?.role === "admin" && user?.admin_scope === "employer";
const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const getPagination = (query = {}) => {
    const page = parsePositiveInt(query.page);
    const requestedLimit = parsePositiveInt(query.limit);

    if (!page && !requestedLimit) {
        return null;
    }

    const limit = Math.min(requestedLimit || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const resolvedPage = page || 1;

    return {
        limit,
        offset: (resolvedPage - 1) * limit,
        page: resolvedPage
    };
};

const buildEmployerPayload = (employer) => ({
    id: employer.id,
    name: employer.name,
    email: employer.email,
    organization_name: employer.EmployerProfile?.organization_name || employer.name,
    logo_url: employer.EmployerProfile?.logo_url || null
});

const fileExists = async (targetPath) => {
    try {
        await fs.promises.access(targetPath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
};

const assertConversationAccess = async (reqUser, employerId, conversation) => {
    if (!conversation) {
        const err = new Error("Conversation not found.");
        err.status = 404;
        throw err;
    }

    if (isEmployerAdmin(reqUser)) {
        return;
    }

    if (reqUser?.role === "employer" && Number(reqUser.id) === Number(employerId)) {
        return;
    }

    const err = new Error("You are not allowed to access this conversation.");
    err.status = 403;
    throw err;
};

const normalizeMessagePayload = (message) => ({
    id: message.id,
    conversationId: message.conversationId,
    senderType: message.senderType,
    senderId: message.senderId,
    message: message.message,
    attachment: toAttachmentUrl(message),
    createdAt: message.createdAt,
    updatedAt: message.updatedAt
});

const normalizeConversationPayload = (conversation, currentUserId, currentUserRole) => {
    // Determine participant avatar based on who is viewing
    // For employers: show admin's avatar (the other participant)
    // For admins: show employer's logo (the other participant)
    let participantAvatarUrl = null;
    if (currentUserRole === "employer" && conversation.admin) {
        participantAvatarUrl = conversation.admin.admin_avatar_url || null;
    } else if (currentUserRole === "admin" && conversation.employer) {
        participantAvatarUrl = conversation.employer.EmployerProfile?.logo_url || null;
    } else if (currentUserRole === "employer" && conversation.adminId) {
        // Employer viewing - fetch admin avatar
        participantAvatarUrl = null; // Will be resolved when admin is loaded
    }

    return {
        id: conversation.id,
        employerId: conversation.employerId,
        adminId: conversation.adminId,
        last_message_text: conversation.last_message_text,
        last_message_at: conversation.last_message_at,
        participant_avatar_url: participantAvatarUrl,
        employer: conversation.employer
            ? {
                id: conversation.employer.id,
                name: conversation.employer.name,
                email: conversation.employer.email,
                organization_name: conversation.employer.EmployerProfile?.organization_name || conversation.employer.name,
                logo_url: conversation.employer.EmployerProfile?.logo_url || null
            }
            : null,
        admin: conversation.admin
            ? {
                id: conversation.admin.id,
                name: conversation.admin.name,
                email: conversation.admin.email,
                admin_avatar_url: conversation.admin.admin_avatar_url || null
            }
            : null
    };
};

const fetchEmployerOrThrow = async (employerId) => {
    const employer = await db.User.findByPk(employerId, {
        include: [{ model: db.EmployerProfile }]
    });

    if (!employer || employer.role !== "employer") {
        const err = new Error("Employer not found.");
        err.status = 404;
        throw err;
    }

    return employer;
};

const resolveAdminUserId = async (adminId) => {
    if (adminId) {
        const admin = await db.User.findByPk(adminId);
        if (admin?.role === "admin" && admin?.admin_scope === "employer") {
            return admin.id;
        }
    }

    const fallbackAdmin = await db.User.findOne({
        where: { role: "admin", admin_scope: "employer" },
        order: [["id", "ASC"]]
    });

    if (!fallbackAdmin) {
        const err = new Error("Employer admin account is not configured.");
        err.status = 400;
        throw err;
    }

    return fallbackAdmin.id;
};

exports.ensureEmployerConversation = async (employerId, adminId) => {
    await fetchEmployerOrThrow(employerId);
    const resolvedAdminId = await resolveAdminUserId(adminId);

    const [conversation] = await db.EmployerConversation.findOrCreate({
        where: { employerId },
        defaults: {
            employerId,
            adminId: resolvedAdminId,
            last_message_text: null,
            last_message_at: null
        }
    });

    if (conversation.adminId !== resolvedAdminId) {
        await conversation.update({ adminId: resolvedAdminId });
    }

    return conversation;
};

exports.sendEmployerMessage = async (req, res, next) => {
    try {
        const employerId = Number(req.body.employerId || req.params.employerId);
        if (!employerId) {
            return res.status(400).json({ msg: "employerId is required." });
        }

        const conversation = await exports.ensureEmployerConversation(
            employerId,
            isEmployerAdmin(req.user) ? req.user.id : null
        );
        await assertConversationAccess(req.user, employerId, conversation);

        const messageText = String(req.body.message || "").trim();
        const attachmentPath = req.file
            ? req.file.storageRef || req.file.path || path.join(attachmentsRoot, path.basename(req.file.filename))
            : null;
        if (!messageText && !attachmentPath) {
            return res.status(400).json({ msg: "Message or attachment is required." });
        }

        const senderType = isEmployerAdmin(req.user) ? "admin" : "employer";
        const created = await db.EmployerMessage.create({
            conversationId: conversation.id,
            senderType,
            senderId: req.user.id,
            message: messageText || null,
            attachment: attachmentPath
        });

        await conversation.update({
            last_message_text: messageText || req.file?.originalname || "Attachment",
            last_message_at: created.createdAt
        });

        return res.status(201).json({
            conversationId: conversation.id,
            employerId: conversation.employerId,
            adminId: conversation.adminId,
            message: normalizeMessagePayload(created)
        });
    } catch (err) {
        return next(err);
    }
};

exports.listEmployerConversations = async (req, res, next) => {
    try {
        if (isEmployerAdmin(req.user)) {
            const pagination = getPagination(req.query);
            const employerQuery = {
                where: { role: "employer" },
                include: [{ model: db.EmployerProfile }],
                order: [["createdAt", "DESC"]]
            };

            let employerUsers;
            let totalEmployers = null;

            if (pagination) {
                const result = await db.User.findAndCountAll({
                    ...employerQuery,
                    distinct: true,
                    limit: pagination.limit,
                    offset: pagination.offset
                });
                employerUsers = result.rows;
                totalEmployers = result.count;
                res.setHeader("X-Page", String(pagination.page));
                res.setHeader("X-Page-Size", String(pagination.limit));
                res.setHeader("X-Total-Count", String(totalEmployers));
            } else {
                employerUsers = await db.User.findAll(employerQuery);
            }

            if (!employerUsers.length) {
                return res.json([]);
            }

            const employerIds = employerUsers.map((employer) => employer.id);
            const existingConversations = await db.EmployerConversation.findAll({
                where: { employerId: employerIds },
                attributes: ["id", "employerId", "adminId"]
            });
            const existingIds = new Set(existingConversations.map((conversation) => conversation.employerId));
            const missingEmployerIds = employerIds.filter((employerId) => !existingIds.has(employerId));

            if (missingEmployerIds.length) {
                const adminId = await resolveAdminUserId(req.user.id);
                await db.EmployerConversation.bulkCreate(
                    missingEmployerIds.map((employerId) => ({
                        employerId,
                        adminId,
                        last_message_text: null,
                        last_message_at: null
                    })),
                    { ignoreDuplicates: true }
                );
            }

            const hydrated = await db.EmployerConversation.findAll({
                where: { employerId: employerIds },
                include: [
                    {
                        model: db.User,
                        as: "employer",
                        include: [{ model: db.EmployerProfile }]
                    },
                    {
                        model: db.User,
                        as: "admin"
                    }
                ],
                order: [["last_message_at", "DESC"], ["updatedAt", "DESC"]]
            });

            const conversationByEmployerId = new Map(
                hydrated.map((conversation) => [conversation.employerId, conversation])
            );

            // Admin viewing - employer's logo_url is the participant avatar
            // Employer viewing - admin's avatar is the participant avatar
            return res.json(
                employerIds
                    .map((employerId) => {
                        const conversation = conversationByEmployerId.get(employerId);
                        if (conversation) return normalizeConversationPayload(conversation, req.user.id, req.user.role);

                        const employer = employerUsers.find((user) => user.id === employerId);
                        // For admin: include logo_url as the participant avatar
                        // For employer: won't have admin yet, but will get it from hydrated convo
                        if (isEmployerAdmin(req.user)) {
                            return {
                                id: null,
                                employerId,
                                adminId: req.user.id,
                                last_message_text: null,
                                last_message_at: null,
                                participant_avatar_url: employer ? employer.EmployerProfile?.logo_url || null : null,
                                employer: employer ? buildEmployerPayload(employer) : null,
                                admin: null
                            };
                        }
                        return {
                            id: null,
                            employerId,
                            adminId: req.user.id,
                            last_message_text: null,
                            last_message_at: null,
                            participant_avatar_url: null,
                            employer: employer ? buildEmployerPayload(employer) : null,
                            admin: null
                        };
                    })
                    .sort((a, b) => {
                        const left = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                        const right = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
                        return right - left;
                    })
            );
        }

        if (req.user?.role === "employer") {
            const conversation = await exports.ensureEmployerConversation(req.user.id, null);
            const hydrated = await db.EmployerConversation.findByPk(conversation.id, {
                include: [
                    {
                        model: db.User,
                        as: "employer",
                        include: [{ model: db.EmployerProfile }]
                    },
                    {
                        model: db.User,
                        as: "admin"
                    }
                ]
            });

            return res.json(hydrated ? [normalizeConversationPayload(hydrated, req.user.id, req.user.role)] : []);
        }

        return res.status(403).json({ msg: "Employer or Employer Admin access only." });
    } catch (err) {
        return next(err);
    }
};

exports.getEmployerMessages = async (req, res, next) => {
    try {
        const employerId = Number(req.params.employerId);
        if (!employerId) {
            return res.status(400).json({ msg: "Valid employerId is required." });
        }

        const conversation = await exports.ensureEmployerConversation(
            employerId,
            isEmployerAdmin(req.user) ? req.user.id : null
        );
        await assertConversationAccess(req.user, employerId, conversation);

        const hydratedConversation = await db.EmployerConversation.findByPk(conversation.id, {
            include: [
                {
                    model: db.User,
                    as: "employer",
                    include: [{ model: db.EmployerProfile }]
                },
                {
                    model: db.User,
                    as: "admin"
                }
            ]
        });

        const messages = await db.EmployerMessage.findAll({
            where: { conversationId: conversation.id },
            order: [["createdAt", "ASC"]]
        });

        return res.json({
            conversation: hydratedConversation
                ? normalizeConversationPayload(hydratedConversation, req.user.id, req.user.role)
                : {
                    id: conversation.id,
                    employerId: conversation.employerId,
                    adminId: conversation.adminId,
                    last_message_text: conversation.last_message_text,
                    last_message_at: conversation.last_message_at,
                    participant_avatar_url: null
                },
            messages: messages.map(normalizeMessagePayload)
        });
    } catch (err) {
        return next(err);
    }
};

exports.downloadEmployerMessageAttachment = async (req, res, next) => {
    try {
        const identifier = String(req.params.fileName || "").trim();
        const fileName = path.basename(identifier);

        const message = /^\d+$/.test(identifier)
            ? await db.EmployerMessage.findByPk(Number(identifier), {
                include: [{ model: db.EmployerConversation, as: "conversation" }]
            })
            : await db.EmployerMessage.findOne({
                where: { attachment: path.join(attachmentsRoot, fileName) },
                include: [{ model: db.EmployerConversation, as: "conversation" }]
            });

        if (!message?.conversation) {
            return res.status(404).json({ msg: "Attachment record not found." });
        }

        await assertConversationAccess(req.user, message.conversation.employerId, message.conversation);
        if (isStoredFileReference(message.attachment) || /^https?:\/\//i.test(String(message.attachment || ""))) {
            return sendStoredFile(
                message.attachment,
                res,
                getStoredFileOriginalName(message.attachment) || fileName
            );
        }

        const storedPath = path.join(attachmentsRoot, fileName);
        if (!(await fileExists(storedPath))) {
            return res.status(404).json({ msg: "Attachment not found." });
        }

        return res.download(storedPath, fileName);
    } catch (err) {
        return next(err);
    }
};

exports.deleteEmployerMessage = async (req, res, next) => {
    try {
        const employerId = Number(req.params.employerId);
        const messageId = Number(req.params.messageId);
        if (!employerId || !messageId) {
            return res.status(400).json({ msg: "Valid employerId and messageId are required." });
        }

        const conversation = await exports.ensureEmployerConversation(
            employerId,
            isEmployerAdmin(req.user) ? req.user.id : null
        );
        await assertConversationAccess(req.user, employerId, conversation);

        const message = await db.EmployerMessage.findOne({
            where: {
                id: messageId,
                conversationId: conversation.id
            }
        });

        if (!message) {
            return res.status(404).json({ msg: "Message not found." });
        }

        const canDelete =
            isEmployerAdmin(req.user) ||
            (message.senderType === "employer" && req.user?.role === "employer" && Number(req.user.id) === Number(message.senderId));

        if (!canDelete) {
            return res.status(403).json({ msg: "You are not allowed to delete this message." });
        }

        if (message.attachment) {
            if (isStoredFileReference(message.attachment)) {
                await destroyStoredFile(message.attachment);
            } else if (await fileExists(message.attachment)) {
                await fs.promises.unlink(message.attachment);
            }
        }

        await message.destroy();

        const latest = await db.EmployerMessage.findOne({
            where: { conversationId: conversation.id },
            order: [["createdAt", "DESC"]]
        });

        await conversation.update({
            last_message_text: latest?.message || path.basename(latest?.attachment || "") || null,
            last_message_at: latest?.createdAt || null
        });

        return res.json({ msg: "Message deleted." });
    } catch (err) {
        return next(err);
    }
};
