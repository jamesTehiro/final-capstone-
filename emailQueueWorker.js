const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { Op } = require("sequelize");
const db = require("../models");
const sendEmail = require("../utils/email");

const pollIntervalMs = Number(process.env.EMAIL_QUEUE_POLL_MS || 2000);
const batchSize = Number(process.env.EMAIL_QUEUE_BATCH_SIZE || 20);
const maxConcurrency = Number(process.env.EMAIL_QUEUE_CONCURRENCY || 5);
const staleProcessingMs = Number(process.env.EMAIL_QUEUE_STALE_MS || 5 * 60 * 1000);
const retryDelayMs = Number(process.env.EMAIL_QUEUE_RETRY_MS || 30000);

const reserveJobs = async () =>
    db.sequelize.transaction(async (transaction) => {
        const jobs = await db.EmailQueueJob.findAll({
            where: {
                status: {
                    [Op.in]: ["pending", "failed"]
                },
                scheduled_at: {
                    [Op.lte]: new Date()
                },
                [Op.and]: db.sequelize.literal("attempts < max_attempts"),
                [Op.or]: [
                    { processing_started_at: null },
                    {
                        processing_started_at: {
                            [Op.lt]: new Date(Date.now() - staleProcessingMs)
                        }
                    }
                ]
            },
            order: [["scheduled_at", "ASC"], ["id", "ASC"]],
            limit: batchSize,
            lock: true,
            skipLocked: true,
            transaction
        });

        if (!jobs.length) return [];

        const reservedIds = jobs.map((job) => job.id);
        await db.EmailQueueJob.update(
            {
                status: "processing",
                processing_started_at: new Date(),
                last_error: null
            },
            {
                where: {
                    id: {
                        [Op.in]: reservedIds
                    }
                },
                transaction
            }
        );

        return db.EmailQueueJob.findAll({
            where: {
                id: {
                    [Op.in]: reservedIds
                }
            },
            order: [["scheduled_at", "ASC"], ["id", "ASC"]],
            transaction
        });
    });

const markJobSent = async (job) =>
    job.update({
        status: "sent",
        sent_at: new Date(),
        processing_started_at: null,
        last_error: null
    });

const markJobFailed = async (job, error) => {
    const nextAttempts = job.attempts + 1;
    const hasRemainingAttempts = nextAttempts < job.max_attempts;

    await job.update({
        status: hasRemainingAttempts ? "pending" : "failed",
        attempts: nextAttempts,
        processing_started_at: null,
        last_error: error.message,
        scheduled_at: hasRemainingAttempts ? new Date(Date.now() + retryDelayMs) : job.scheduled_at
    });
};

const processJob = async (job) => {
    console.log("=== [DEBUG] EmailQueueWorker processing job ===");
    console.log("[DEBUG] Job ID:", job.id);
    console.log("[DEBUG] To:", job.to);
    console.log("[DEBUG] Subject:", job.subject);
    console.log("[DEBUG] Status:", job.status);
    console.log("[DEBUG] Attempts:", job.attempts);
    try {
        console.log("[DEBUG] Calling sendEmail()...");
        await sendEmail(job.to, job.subject, job.message);
        console.log("[DEBUG] sendEmail() completed successfully");
        await markJobSent(job);
        console.log("[DEBUG] Job marked as sent. New status: sent");
    } catch (error) {
        console.error("[DEBUG] sendEmail() FAILED:", error.message);
        console.error("[DEBUG] sendEmail() error stack:", error.stack);
        await markJobFailed(job, error);
        console.log("[DEBUG] Job marked as failed. New status:", job.status);
    }
};

const processBatch = async () => {
    const jobs = await reserveJobs();
    if (!jobs.length) return;

    for (let index = 0; index < jobs.length; index += maxConcurrency) {
        const slice = jobs.slice(index, index + maxConcurrency);
        // eslint-disable-next-line no-await-in-loop
        await Promise.allSettled(slice.map((job) => processJob(job)));
    }
};

const main = async () => {
    await db.sequelize.authenticate();

    // eslint-disable-next-line no-console
    console.log("Email queue worker started.");

    const run = async () => {
        try {
            await processBatch();
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error("Email queue worker error:", error);
        } finally {
            setTimeout(run, pollIntervalMs).unref();
        }
    };

    run();
};

main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Failed to start email queue worker:", error);
    process.exit(1);
});
