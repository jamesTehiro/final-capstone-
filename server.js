// server.js

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const db = require("./models");

const rateLimiter = require("./middleware/rateLimiter");
const sanitizeMiddleware = require("./middleware/sanitizeMiddleware");
const requestLogger = require("./middleware/requestLogger");
const errorHandler = require("./middleware/errorHandler");
const fileController = require("./controllers/fileController");

let helmet;
try {
    // Prefer the official helmet package if installed
    // eslint-disable-next-line global-require
    helmet = require("helmet");
} catch {
    helmet = null;
}

const app = express();
app.disable("x-powered-by");

const trustProxyHops = process.env.TRUST_PROXY_HOPS;
if (trustProxyHops) {
    app.set("trust proxy", Number(trustProxyHops));
}

// --- MIDDLEWARE ---
// Configure CORS explicitly per environment
const defaultAllowedOrigins = [
    "http://localhost:5173", // React dev server
    "http://localhost:5000" // backend admin panel
];

const envOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const allowedOrigins = new Set([
    ...defaultAllowedOrigins,
    ...envOrigins,
    process.env.VITE_API_URL
].filter(Boolean));

const isProduction = process.env.NODE_ENV === "production";
const allowAllDevOrigins = !isProduction && process.env.ALLOW_ALL_ORIGINS === "true";

const allowNgrokOrigins = process.env.ALLOW_NGROK_ORIGINS === "true";

const isPrivateNetworkHostname = (hostname = "") =>
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname);

const corsOptions = {
    origin: (origin, callback) => {
        // Allow non-browser clients (no Origin header)
        if (!origin) {
            return callback(null, true);
        }

        if (allowAllDevOrigins) {
            return callback(null, true);
        }

        if (allowedOrigins.has(origin)) {
            return callback(null, true);
        }

        if (!isProduction) {
            try {
                const parsedOrigin = new URL(origin);
                if (isPrivateNetworkHostname(parsedOrigin.hostname)) {
                    return callback(null, true);
                }
            } catch {
                // Fall through to the standard rejection below.
            }
        }

        if (allowNgrokOrigins && origin.endsWith(".ngrok-free.dev")) {
            return callback(null, true);
        }

        return callback(new Error(`CORS blocked: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
// Express 5 path-to-regexp does not accept "*" as a path string
app.options(/.*/, cors(corsOptions));

if (helmet) {
    app.use(
        helmet({
            contentSecurityPolicy: isProduction
                ? {
                    directives: {
                        defaultSrc: ["'self'"],
                        baseUri: ["'self'"],
                        objectSrc: ["'none'"],
                        frameAncestors: ["'self'"],
                        formAction: ["'self'"],
                        imgSrc: ["'self'", "data:", "blob:"],
                        fontSrc: ["'self'", "data:"],
                        mediaSrc: ["'self'", "blob:"],
                        scriptSrcAttr: ["'none'"],
                        styleSrc: ["'self'", "'unsafe-inline'"],
                        scriptSrc: ["'self'"],
                        workerSrc: ["'self'", "blob:"],
                        connectSrc: ["'self'", ...Array.from(allowedOrigins)]
                    }
                }
                : false
        })
    );
} else {
    // Minimal security headers fallback
    app.use((req, res, next) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "SAMEORIGIN");
        res.setHeader("Referrer-Policy", "no-referrer");
        if (isProduction) {
            res.setHeader(
                "Content-Security-Policy",
                "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; script-src-attr 'none'; worker-src 'self' blob:; connect-src 'self'"
            );
        }
        next();
    });
}

app.use(rateLimiter);
app.use(requestLogger);
app.use(sanitizeMiddleware);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Uploads folder for file storage instead of DB blobs
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.get("/uploads/images/:fileName", fileController.getPublicImage);
app.get("/uploads/:fileName", fileController.getPublicImage);

// --- API ROUTES ---
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/files", require("./routes/fileRoutes"));
app.use("/api/profile", require("./routes/profileRoutes"));
app.use("/api/profiles", require("./routes/profileRoutes"));
app.use("/api/jobs", require("./routes/jobRoutes"));
app.use("/api/applications", require("./routes/applicationRoutes"));
app.use("/api/announcements", require("./routes/announcementRoutes"));
app.use("/api/comments", require("./routes/commentRoutes"));
app.use("/api/chat", require("./routes/chatRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/registrar", require("./routes/registrarRoutes"));
app.use("/api/alumni-records", require("./routes/alumniRecordRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/posts", require("./routes/postRoutes"));
app.use("/api/messages", require("./routes/messageRoutes"));
app.use("/api/admin-employer", require("./routes/adminEmployerMessageRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/resumes", require("./routes/resumeRoutes"));

// --- SERVE REACT BUILD ---
const reactBuildPath = path.join(__dirname, "dist");
app.use(express.static(reactBuildPath));

// Serve React build for everything except /api
app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(reactBuildPath, "index.html"));
});

// Centralized error handler (keeps API responses consistent)
app.use(errorHandler);

// --- SOCKET.IO SETUP ---
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (allowedOrigins.has(origin)) return callback(null, true);
            if (!isProduction) {
                try {
                    const parsedOrigin = new URL(origin);
                    if (isPrivateNetworkHostname(parsedOrigin.hostname)) {
                        return callback(null, true);
                    }
                } catch { }
            }
            return callback(null, true);
        },
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Make io accessible to controllers
app.set("io", io);

// Socket.IO authentication middleware
const jwt = require("jsonwebtoken");
io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
        return next(new Error("Authentication required"));
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "your_jwt_secret");
        socket.userId = decoded.id;
        socket.user = decoded;
        next();
    } catch (err) {
        return next(new Error("Invalid token"));
    }
});

io.on("connection", (socket) => {
    const user = socket.user || {};
    const userId = user.id || socket.userId;
    const userCourse = user.AlumniProfile?.course || user.admin_scope || "N/A";

    console.log(`[SOCKET.IO] User ${userId} connected (socket: ${socket.id}, course: ${userCourse})`);

    // Track current conversation per socket for logging
    const socketMeta = new Map();
    socketMeta.set(socket.id, {
        userId,
        userCourse,
        currentRoom: null
    });

    // Join a conversation room
    socket.on("join-conversation", (conversationId) => {
        const room = `conversation:${conversationId}`;
        socket.join(room);

        const meta = socketMeta.get(socket.id) || { userId, userCourse };
        meta.currentRoom = room;
        socketMeta.set(socket.id, meta);

        console.log(`[SOCKET.IO] User ${userId} (course: ${userCourse}) joined room ${room} (socket: ${socket.id})`);

        // Log all sockets currently in this room
        const roomSockets = io.sockets.adapter.rooms.get(room);
        if (roomSockets) {
            const socketIds = Array.from(roomSockets);
            console.log(`[SOCKET.IO] Room ${room} now has ${socketIds.length} socket(s): ${socketIds.join(", ")}`);

            // Try to resolve user IDs for these sockets
            const connectedUserIds = [];
            for (const sid of socketIds) {
                const s = io.sockets.sockets.get(sid);
                if (s && s.userId) {
                    connectedUserIds.push(s.userId);
                }
            }
            console.log(`[SOCKET.IO] Room ${room} connected user IDs: ${connectedUserIds.join(", ")}`);
        }
    });

    // Leave a conversation room
    socket.on("leave-conversation", (conversationId) => {
        const room = `conversation:${conversationId}`;
        socket.leave(room);

        const meta = socketMeta.get(socket.id);
        if (meta && meta.currentRoom === room) {
            meta.currentRoom = null;
            socketMeta.set(socket.id, meta);
        }

        console.log(`[SOCKET.IO] User ${userId} left room ${room} (socket: ${socket.id})`);
    });

    socket.on("disconnect", () => {
        console.log(`[SOCKET.IO] User ${userId} disconnected (socket: ${socket.id}, course: ${userCourse})`);
        socketMeta.delete(socket.id);
    });
});

// --- START SERVER ---
const PORT = process.env.PORT || 5000;
const shouldSync = process.env.ENABLE_DB_SYNC === "true";

const normalizeTableNames = (tables = []) =>
    tables.map((table) => {
        if (typeof table === "string") return table.toLowerCase();
        if (table?.tableName) return String(table.tableName).toLowerCase();
        if (table?.TABLE_NAME) return String(table.TABLE_NAME).toLowerCase();
        return String(table).toLowerCase();
    });

const ensureApplicationSchema = async (queryInterface) => {
    const applicationTable = db.Application.getTableName();
    const applicationTableName = typeof applicationTable === "string"
        ? applicationTable
        : applicationTable.tableName;

    const columns = await queryInterface.describeTable(applicationTableName);
    const requiredColumns = [
        "full_name",
        "email",
        "dob",
        "position_applied_for",
        "department_office",
        "employment_type",
        "preferred_work_location",
        "expected_salary",
        "start_date",
        "place_of_birth",
        "gender",
        "contact_number",
        "nationality",
        "address",
        "professional_summary",
        "civil_service_eligibility",
        "rating",
        "license_number",
        "validity",
        "years_attended",
        "honors",
        "responsibilities",
        "achievements",
        "reason_for_leaving",
        "soft_skills",
        "certifications",
        "leadership_role",
        "people_managed",
        "leadership_achievements",
        "training_title",
        "training_organization",
        "training_duration",
        "training_date",
        "reference_position",
        "reference_company",
        "civil_status",
        "disability",
        "disability_other",
        "employment_status",
        "employment_type_detail",
        "ofw",
        "former_ofw",
        "four_ps",
        "preferred_occupation",
        "preferred_work_type",
        "preferred_location_type",
        "preferred_location_detail",
        "languages",
        "currently_in_school",
        "education_level",
        "work_status",
        "other_skills",
        "other_skills_other",
        "convicted_of_crime",
        "dismissed_from_service",
        "currently_employed",
        "can_work_overtime",
        "why_join",
        "good_fit",
        "career_goals",
        "declaration_confirmed",
        "notes",
        "resume_path",
        "transcript_path",
        "certificate_path"
    ];

    const missingColumns = requiredColumns.filter((column) => !columns[column]);
    if (missingColumns.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(
            `Application schema missing columns: ${missingColumns.join(", ")}. Run migrations or start once with ENABLE_DB_SYNC=true if you explicitly want schema changes.`
        );
    }
};

const ensureInterviewSchema = async (queryInterface) => {
    const interviewTable = db.Interview.getTableName();
    const interviewTableName = typeof interviewTable === "string"
        ? interviewTable
        : interviewTable.tableName;

    const columns = await queryInterface.describeTable(interviewTableName);
    const requiredColumns = ["what_to_bring"];
    const missingColumns = requiredColumns.filter((column) => !columns[column]);

    if (missingColumns.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(
            `Interview schema missing columns: ${missingColumns.join(", ")}. Run migrations or start once with ENABLE_DB_SYNC=true if you explicitly want schema changes.`
        );
    }
};

const alignJobSchema = async (queryInterface) => {
    const jobTable = db.Job.getTableName();
    const jobTableName = typeof jobTable === "string" ? jobTable : jobTable.tableName;
    const columns = await queryInterface.describeTable(jobTableName);

    if (!columns.expected_salary && db.Job.rawAttributes.expected_salary) {
        // Keep the model compatible with older databases that do not yet have the column.
        delete db.Job.rawAttributes.expected_salary;
        db.Job.refreshAttributes();
    }
};

const ensureDatabaseReady = async () => {
    if (shouldSync) {
        return db.sequelize.sync({ alter: true });
    }

    await db.sequelize.authenticate();

    if (isProduction) {
        return null;
    }

    const queryInterface = db.sequelize.getQueryInterface();
    const existingTables = normalizeTableNames(await queryInterface.showAllTables());
    const hasUsersTable = existingTables.includes("users");
    const requiredOptionalTables = [
        { name: "employerconversations", model: db.EmployerConversation },
        { name: "employermessages", model: db.EmployerMessage },
        { name: "password_reset_tokens", model: db.PasswordResetToken },
        { name: "email_queue_jobs", model: db.EmailQueueJob },
        { name: "rate_limit_entries", model: db.RateLimitEntry }
    ];

    if (!hasUsersTable) {
        throw new Error(
            "Users table not found. Refusing automatic schema creation. Run migrations or start once with ENABLE_DB_SYNC=true."
        );
    }

    for (const entry of requiredOptionalTables) {
        if (!existingTables.includes(entry.name)) {
            // eslint-disable-next-line no-console
            console.warn(`${entry.name} table not found. Creating it without full schema sync.`);
            // eslint-disable-next-line no-await-in-loop
            await entry.model.sync();
        }
    }

    if (existingTables.includes("applications")) {
        await ensureApplicationSchema(queryInterface);
    }

    if (existingTables.includes("interviews")) {
        await ensureInterviewSchema(queryInterface);
    }

    if (existingTables.includes("jobs")) {
        await alignJobSchema(queryInterface);
    }

    return null;
};

const listRoutes = (app) => {
    const routes = [];
    const collect = (layer, prefix = "") => {
        if (layer.route) {
            const methods = Object.keys(layer.route.methods)
                .filter((m) => layer.route.methods[m])
                .map((m) => m.toUpperCase())
                .join(",");
            routes.push({ methods, path: prefix + layer.route.path });
        } else if (layer.name === "router" && layer.handle) {
            layer.handle.stack.forEach((sub) => collect(sub, prefix + layer.regexp.toString().replace("\\", "")));
        }
    };
    app._router.stack.forEach((layer) => collect(layer));
    return routes;
};

const startEmailWorker = () => {
    const { fork } = require("child_process");
    const workerPath = path.join(__dirname, "workers", "emailQueueWorker.js");
    const worker = fork(workerPath, [], {
        stdio: "inherit",
        env: { ...process.env }
    });

    worker.on("exit", (code) => {
        // eslint-disable-next-line no-console
        console.warn(`Email queue worker exited with code ${code}. Restarting in 5 seconds...`);
        setTimeout(startEmailWorker, 5000);
    });

    worker.on("error", (err) => {
        // eslint-disable-next-line no-console
        console.error("Email queue worker error:", err.message);
    });

    // eslint-disable-next-line no-console
    console.log("Email queue worker started (PID: " + worker.pid + ").");
};

const startup = ensureDatabaseReady();
startup
    .then(() => {
        if (process.env.LIST_ROUTES === "true") {
            console.log("\nRegistered routes:");
            listRoutes(app).forEach((r) => console.log(`  ${r.methods.padEnd(8)} ${r.path}`));
            console.log();
        }

        server.listen(PORT, () => {
            // eslint-disable-next-line no-console
            console.log(`Server running on http://localhost:${PORT}`);
        });

        // Start the email queue worker in the background
        startEmailWorker();
    })
    .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("Failed to start server:", err);
        process.exit(1);
    });