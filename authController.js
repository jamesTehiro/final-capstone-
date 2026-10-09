const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require("../models");
const { enqueueEmails } = require("../utils/emailQueue");
const { consumeRateLimit } = require("../utils/rateLimitStore");

const ADMIN_SCOPES = ["registrar", "employer", "alumni"];
const RESET_ROLES = new Set(["employer", "alumni"]);
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const RESET_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RESET_RATE_LIMIT_MAX = 3;
const RESET_RATE_LIMIT_STORE = (process.env.RESET_RATE_LIMIT_STORE || "database").toLowerCase();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "2h";

const sanitizeUser = (user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    admin_scope: user.admin_scope,
    admin_department: user.admin_department,
    admin_avatar_url: user.admin_avatar_url,
    account_status: user.account_status
});

const signToken = (payload) => {
    if (!JWT_SECRET) {
        throw new Error("JWT secret not configured");
    }

    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
        issuer: "alumni-portal"
    });
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const normalizeRole = (value) => String(value || "").trim().toLowerCase();

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const getClientIp = (req) =>
    String(
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.ip ||
        req.connection?.remoteAddress ||
        "unknown"
    );

const isResetRoleAllowed = (role) => RESET_ROLES.has(normalizeRole(role));

const sendGenericForgotPasswordResponse = (res) =>
    res.json({ msg: "If an account exists, a reset link has been sent." });

const isForgotPasswordRateLimited = async (req) => {
    const result = await consumeRateLimit({
        scope: "forgot-password",
        key: getClientIp(req),
        windowMs: RESET_RATE_LIMIT_WINDOW_MS,
        maxRequests: RESET_RATE_LIMIT_MAX,
        store: RESET_RATE_LIMIT_STORE
    });

    return !result.allowed;
};

const getFrontendBaseUrl = (req) =>
    String(
        req.headers.origin ||
        process.env.FRONTEND_URL ||
        process.env.CLIENT_URL ||
        process.env.APP_URL ||
        "http://localhost:5173"
    ).replace(/\/$/, "");

exports.register = async (req, res, next) => {
    try {
        const { name, email, password, role, company_address, companyAddress, website_url, websiteUrl, course, graduationYear, graduation_year } = req.body;
        const proofDocumentFile = req.files?.proof_document?.[0];

        if (!name || !email || !password || !role) {
            return res.status(400).json({ msg: "Name, email, password, and role are required." });
        }

        if (role === "admin") {
            return res
                .status(403)
                .json({ msg: "Admin registration is disabled. Please contact system administrator." });
        }

        if (!["alumni", "employer"].includes(role)) {
            return res.status(400).json({ msg: "Invalid role" });
        }

        const existing = await db.User.findOne({ where: { email } });
        if (existing) {
            return res.status(409).json({ msg: "Email is already registered." });
        }

        const businessPermitFile = req.files?.business_permit?.[0];
        if (role === "employer" && !businessPermitFile) {
            return res.status(400).json({ msg: "Business permit upload is required." });
        }

        const hashed = await bcrypt.hash(password, 12);

        const user = await db.sequelize.transaction(async (transaction) => {
            const createdUser = await db.User.create(
                {
                    name,
                    email,
                    password: hashed,
                    role
                },
                { transaction }
            );

            if (role === "employer") {
                const address = company_address || companyAddress || null;
                const businessPermitPath =
                    // Preserve cloudinary/object storage behavior via storageRef.
                    // In local-disk mode, never store multer's absolute Windows path.
                    businessPermitFile.storageRef ||
                    `/uploads/documents/${businessPermitFile.filename}`;
                await db.EmployerProfile.findOrCreate({
                    where: { user_id: createdUser.id },
                    defaults: {
                        user_id: createdUser.id,
                        organization_name: name,
                        website_url: website_url || websiteUrl || null,
                        business_permit_path: businessPermitPath,
                        address,
                        contact_email: email,
                        verified: false
                    },
                    transaction
                });
            }

            if (role === "alumni") {
                const proofDocumentPath = proofDocumentFile
                    ? (proofDocumentFile.storageRef || `/uploads/documents/${proofDocumentFile.filename}`)
                    : null;

                await db.AlumniProfile.findOrCreate({
                    where: { user_id: createdUser.id },
                    defaults: {
                        user_id: createdUser.id,
                        course: course || null,
                        graduation_year: graduationYear || graduation_year || null,
                        proof_document_path: proofDocumentPath
                    },
                    transaction
                });

                if (proofDocumentPath) {
                    const accountProfile = await db.AlumniProfile.findOne({ where: { user_id: createdUser.id }, transaction });
                    if (accountProfile) {
                        accountProfile.proof_document_path = proofDocumentPath;
                        await accountProfile.save({ transaction });
                    }
                }
            }

            return createdUser;
        });

        return res.status(201).json({
            msg: "Registration successful",
            user: sanitizeUser(user)
        });
    } catch (err) {
        return next(err);
    }
};

exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ msg: "Email and password are required." });
        }

        const user = await db.User.findOne({ where: { email } });

        if (!user) return res.status(404).json({ msg: "User not found" });

        if (user.account_status === "suspended" || user.account_status === "deactivated") {
            return res.status(403).json({ msg: "Your account is suspended. Please contact administrator." });
        }

        if (user.account_status === "pending" && user.role !== "admin") {
            return res.status(403).json({ msg: "Your account is pending verification by administrator." });
        }

        const match = await bcrypt.compare(password, user.password);

        if (!match) return res.status(400).json({ msg: "Invalid credentials" });

        const normalizedAdminScope = user.role === "admin" ? user.admin_scope || "alumni" : null;
        const token = signToken({ id: user.id, role: user.role, admin_scope: normalizedAdminScope });

        return res.json({
            token,
            token_type: "Bearer",
            expires_in: JWT_EXPIRES_IN,
            user: {
                ...sanitizeUser(user),
                admin_scope: normalizedAdminScope
            }
        });
    } catch (err) {
        return next(err);
    }
};

exports.getAdminSetupStatus = async (req, res) => {

    try {
        const admins = await db.User.findAll({
            where: { role: "admin" },
            attributes: ["id", "admin_scope", "email"]
        })

        const registrarAdminExists = admins.some((a) => a.admin_scope === "registrar")
        const alumniAdminExists = admins.some((a) => a.admin_scope === "alumni")
        const employerAdminExists = admins.some((a) => a.admin_scope === "employer")

        res.json({
            registrarAdminExists,
            alumniAdminExists,
            employerAdminExists,
            setupComplete: registrarAdminExists && alumniAdminExists && employerAdminExists,
            availableScopes: ADMIN_SCOPES.filter((scope) => !admins.some((a) => a.admin_scope === scope))
        })
    } catch (err) {
        return next(err);
    }

}

exports.setupAdmin = async (req, res, next) => {

    try {
        const { name, email, password, admin_scope } = req.body

        if (!name || !email || !password || !admin_scope) {
            return res.status(400).json({ msg: "Name, email, password, and admin role are required." })
        }

        if (!ADMIN_SCOPES.includes(admin_scope)) {
            return res.status(400).json({ msg: "Invalid admin role." })
        }

        const scopeExists = await db.User.findOne({
            where: { role: "admin", admin_scope }
        })

        if (scopeExists) {
            return res.status(400).json({ msg: `The ${admin_scope} admin account already exists.` })
        }

        const emailExists = await db.User.findOne({ where: { email } })
        if (emailExists) {
            return res.status(400).json({ msg: "Email is already in use." })
        }

        const adminCount = await db.User.count({ where: { role: "admin" } })
        if (adminCount >= ADMIN_SCOPES.length) {
            return res.status(400).json({ msg: "Admin accounts are already configured. Contact system administrator." })
        }

        const hashed = await bcrypt.hash(password, 10)

        const user = await db.User.create({
            name,
            email,
            password: hashed,
            role: "admin",
            admin_scope,
            account_status: "verified"
        })

        res.json({
            msg: `${admin_scope} admin account created.`,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                admin_scope: user.admin_scope
            }
        })
    } catch (err) {
        if (err?.name === "SequelizeUniqueConstraintError") {
            return res.status(400).json({ msg: `The ${admin_scope} admin account already exists.` });
        }
        return next(err);
    }

}

exports.forgotPassword = async (req, res, next) => {
    try {
        if (await isForgotPasswordRateLimited(req)) {
            return res.status(429).json({ msg: "Too many requests. Please try again later." });
        }

        const role = normalizeRole(req.body?.role);
        const email = normalizeEmail(req.body?.email);

        console.warn(`[forgot-password] ${new Date().toISOString()} ip=${getClientIp(req)} role=${role || "unknown"}`);

        if (!isResetRoleAllowed(role) || !email) {
            return sendGenericForgotPasswordResponse(res);
        }

        const user = await db.User.findOne({
            where: {
                email,
                role
            }
        });

        if (!user) {
            return sendGenericForgotPasswordResponse(res);
        }

        const rawToken = crypto.randomBytes(32).toString("hex");
        const token = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
        const resetLink = `${getFrontendBaseUrl(req)}/reset-password?token=${encodeURIComponent(rawToken)}`;

        await db.PasswordResetToken.destroy({
            where: {
                user_id: user.id,
                role
            }
        });

        await db.PasswordResetToken.create({
            user_id: user.id,
            role,
            token,
            expires_at: expiresAt
        });

        await enqueueEmails([
            {
                to: user.email,
                subject: "Reset your password",
                message: [
                    `We received a password reset request for your ${role} account.`,
                    "",
                    `Reset your password here: ${resetLink}`,
                    "",
                    "This link expires in 15 minutes.",
                    "If you did not request this, you can safely ignore this email."
                ].join("\n")
            }
        ]);

        return sendGenericForgotPasswordResponse(res);
    } catch (err) {
        return next(err);
    }
};

exports.resetPassword = async (req, res, next) => {
    try {
        const token = String(req.body?.token || "").trim();
        const newPassword = String(req.body?.newPassword || "");

        if (!token || !newPassword) {
            return res.status(400).json({ msg: "Token and new password are required." });
        }

        const tokenHash = hashToken(token);
        const resetToken = await db.PasswordResetToken.findOne({ where: { token: tokenHash } });

        if (!resetToken) {
            return res.status(400).json({ msg: "Reset link is invalid or has expired." });
        }

        if (!isResetRoleAllowed(resetToken.role)) {
            await resetToken.destroy();
            return res.status(400).json({ msg: "Reset link is invalid or has expired." });
        }

        const expiresAt = new Date(resetToken.expires_at).getTime();
        if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
            await resetToken.destroy();
            return res.status(400).json({ msg: "Reset link is invalid or has expired." });
        }

        const user = await db.User.findOne({
            where: {
                id: resetToken.user_id,
                role: resetToken.role
            }
        });

        if (!user) {
            await resetToken.destroy();
            return res.status(400).json({ msg: "Reset link is invalid or has expired." });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await db.sequelize.transaction(async (transaction) => {
            await user.update({ password: hashedPassword }, { transaction });
            await db.PasswordResetToken.destroy({
                where: {
                    user_id: user.id,
                    role: resetToken.role
                },
                transaction
            });
        });

        console.warn(
            `[password-reset] ${new Date().toISOString()} ip=${getClientIp(req)} role=${resetToken.role} user_id=${user.id}`
        );

        return res.json({
            msg: "Password updated successfully.",
            role: resetToken.role
        });
    } catch (err) {
        return next(err);
    }
};
