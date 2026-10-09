const db = require("../models");

/**
 * Fire-and-forget audit logging service.
 * Logs requirement-related actions without blocking the primary operation.
 * Failures are silently caught to prevent audit logging from breaking core functionality.
 */
const auditService = {
    /**
     * Log an audit event.
     * @param {Object} params
     * @param {number} params.actorId - User ID of the actor
     * @param {string} params.actorRole - Role of the actor ('employer', 'alumni', 'admin')
     * @param {string} params.action - Action identifier (e.g. 'job.requirements.created')
     * @param {string} params.targetType - Type of target ('job', 'application', 'requirement', 'document')
     * @param {number} [params.targetId] - ID of the affected entity
     * @param {string} [params.requirementCode] - Requirement code if applicable
     * @param {Object} [params.metadata] - Additional context data
     * @param {string} [params.ipAddress] - IP address of the actor
     */
    async log({ actorId, actorRole, action, targetType, targetId, requirementCode, metadata, ipAddress }) {
        try {
            await db.AuditLog.create({
                actor_id: actorId,
                actor_role: actorRole,
                action,
                target_type: targetType,
                target_id: targetId || null,
                requirement_code: requirementCode || null,
                metadata: metadata || null,
                ip_address: ipAddress || null
            });
        } catch (err) {
            // Audit logging is non-blocking; failures are silently caught
            console.error("[auditService] Failed to log event:", err.message);
        }
    }
};

module.exports = auditService;