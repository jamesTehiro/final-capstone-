const db = require("../models");
const notificationController = require("./notificationController");
const { Op } = require("sequelize");
const auditService = require("../services/auditService");

const getExistingAttributes = (tableColumns, preferredAttributes, fallbackAttributes) => {
    if (!tableColumns) return fallbackAttributes;
    const available = preferredAttributes.filter((attribute) => Object.prototype.hasOwnProperty.call(tableColumns, attribute));
    return available.length ? available : fallbackAttributes;
};

const getTableColumns = async (queryInterface, tableName) => {
    try {
        return await queryInterface.describeTable(tableName);
    } catch {
        return null;
    }
};

const getNextRequirementVersion = async (jobId) => {
    const maxVersion = await db.JobRequirement.max("version", {
        where: { job_id: jobId }
    });
    return (maxVersion || 0) + 1;
};

const createRequirementsForJob = async (jobId, requirements, version, transaction) => {
    if (!requirements || !Array.isArray(requirements) || requirements.length === 0) {
        return [];
    }

    const created = [];
    for (let i = 0; i < requirements.length; i++) {
        const req = requirements[i];
        let requirementCode = req.requirement_code;

        if (req.library_code) {
            const libItem = await db.RequirementLibrary.findOne({
                where: { requirement_code: req.library_code, is_active: true },
                transaction
            });
            if (!libItem) {
                throw new Error(`Library requirement "${req.library_code}" not found.`);
            }
            requirementCode = libItem.requirement_code;
        } else if (req.is_custom || !requirementCode) {
            requirementCode = `custom_${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${i}`;
        }

        const jobReq = await db.JobRequirement.create({
            job_id: jobId,
            version,
            group_id: req.group_id || null,
            library_id: req.library_id || null,
            requirement_code: requirementCode,
            label: req.label,
            description: req.description || null,
            requirement_type: req.requirement_type || "document_upload",
            value_type: req.value_type || (req.requirement_type === "information_field" ? "text" : "file"),
            value_options: req.value_options || null,
            required: req.required !== undefined ? req.required : true,
            is_custom: req.is_custom || false,
            allowed_types: req.allowed_types || null,
            max_file_size: req.max_file_size || null,
            sort_order: req.sort_order !== undefined ? req.sort_order : i
        }, { transaction });

        created.push(jobReq);
    }

    return created;
};

const createGroupsForJob = async (jobId, version, groups, transaction) => {
    if (!groups || !Array.isArray(groups) || groups.length === 0) {
        return [];
    }

    const created = [];
    for (let i = 0; i < groups.length; i++) {
        const group = await db.RequirementGroup.create({
            job_id: jobId,
            version,
            group_label: groups[i].label,
            sort_order: groups[i].sort_order !== undefined ? groups[i].sort_order : i
        }, { transaction });
        created.push(group);
    }
    return created;
};

exports.createJob = async (req, res) => {
    try {
        const { title, description, location, employment_type, course_target, expected_salary, requirements, groups } = req.body;

        if (!title || !description || !location || !expected_salary) {
            return res.status(400).json({ msg: "Title, description, location, and expected salary are required." });
        }

        const hasRequirements = requirements && Array.isArray(requirements) && requirements.length > 0;

        const job = await db.sequelize.transaction(async (transaction) => {
            const createPayload = {
                title,
                description,
                location,
                employment_type: employment_type || "Full-time",
                course_target: course_target || null,
                employer_id: req.user.id,
                expected_salary: expected_salary || null,
                has_requirements: hasRequirements,
                current_requirement_version: hasRequirements ? 1 : 0
            };

            const newJob = await db.Job.create(createPayload, { transaction });

            if (hasRequirements) {
                const createdGroups = await createGroupsForJob(newJob.id, 1, groups, transaction);

                const groupMap = {};
                if (groups && Array.isArray(groups)) {
                    for (let i = 0; i < groups.length; i++) {
                        const createdGroup = createdGroups[i];
                        if (createdGroup) {
                            groupMap[groups[i].tempId || i] = createdGroup.id;
                        }
                    }
                }

                const mappedRequirements = (requirements || []).map((req) => ({
                    ...req,
                    group_id: req.group_temp_id !== undefined ? (groupMap[req.group_temp_id] || null) : (req.group_id || null)
                }));

                await createRequirementsForJob(newJob.id, mappedRequirements, 1, transaction);
            }

            return newJob;
        });

        auditService.log({
            actorId: req.user.id,
            actorRole: "employer",
            action: hasRequirements ? "job.requirements.created" : "job.created",
            targetType: "job",
            targetId: job.id,
            metadata: { version: job.current_requirement_version, requirement_count: requirements?.length || 0 },
            ipAddress: req.ip
        });

        const result = await db.Job.findByPk(job.id, {
            include: hasRequirements ? [
                { model: db.JobRequirement, where: { version: job.current_requirement_version }, required: false },
                { model: db.RequirementGroup, where: { version: job.current_requirement_version }, required: false }
            ] : []
        });

        // Notify verified alumni about the new job
        try {
            let alumniIds = [];
            const hasNonEmptyCourseTarget = job.course_target && job.course_target.trim().length > 0;

            if (hasNonEmptyCourseTarget) {
                const alumniInclude = [{
                    model: db.AlumniProfile,
                    where: { course: job.course_target },
                    attributes: []
                }];

                const filteredUsers = await db.User.findAll({
                    where: { role: "alumni", account_status: "verified" },
                    include: alumniInclude,
                    attributes: ["id"]
                });
                alumniIds = filteredUsers.map((u) => u.id);

                // If no alumni match the course_target text, fall back to notifying ALL verified alumni
                // This is because course_target often contains full qualification text rather than
                // exact course codes, so exact matching fails silently.
                if (alumniIds.length === 0) {
                    const allVerifiedUsers = await db.User.findAll({
                        where: { role: "alumni", account_status: "verified" },
                        attributes: ["id"]
                    });
                    alumniIds = allVerifiedUsers.map((u) => u.id);
                }
            } else {
                // No course_target: notify all verified alumni
                const allVerifiedUsers = await db.User.findAll({
                    where: { role: "alumni", account_status: "verified" },
                    attributes: ["id"]
                });
                alumniIds = allVerifiedUsers.map((u) => u.id);
            }

            if (alumniIds.length) {
                try {
                    // Fetch employer profile to get company name
                    const employerProfile = await db.EmployerProfile.findOne({
                        where: { user_id: req.user.id }
                    });

                    const companyName = employerProfile?.organization_name || req.user.name || "An employer";

                    // Build a notification message with job details
                    const message = `A new job opportunity has been posted: "${job.title}" by ${companyName}. View the job details and apply if interested.`;

                    await notificationController.createNotification({
                        userIds: alumniIds,
                        message,
                        subject: "New Job Opportunity",
                        type: "job_posting"
                    });
                } catch (profileErr) {
                    // Fallback to simpler message if profile fetch fails
                    const employerName = req.user.name || "An employer";
                    const message = `A new job opportunity has been posted: "${job.title}" by ${employerName}. View the job details and apply if interested.`;

                    await notificationController.createNotification({
                        userIds: alumniIds,
                        message,
                        subject: "New Job Opportunity",
                        type: "job_posting"
                    });
                }
            }
        } catch (notifErr) {
            console.error("Job notification error:", notifErr.message);
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.updateJob = async (req, res) => {
    try {
        const job = await db.Job.findByPk(req.params.id);
        if (!job) return res.status(404).json({ msg: "Job not found" });

        const isOwner = req.user?.role === "employer" && job.employer_id === req.user.id;
        const isAdmin = req.user?.role === "admin";
        if (!isOwner && !isAdmin) return res.status(403).json({ msg: "Not allowed." });

        const { title, description, location, employment_type, course_target, expected_salary, requirements, groups } = req.body;

        const hasRequirements = requirements && Array.isArray(requirements) && requirements.length > 0;

        await db.sequelize.transaction(async (transaction) => {
            const updateFields = {};
            if (title !== undefined) updateFields.title = title;
            if (description !== undefined) updateFields.description = description;
            if (employment_type !== undefined) updateFields.employment_type = employment_type;
            if (course_target !== undefined) updateFields.course_target = course_target;
            if (expected_salary !== undefined) updateFields.expected_salary = expected_salary;

            if (hasRequirements) {
                const nextVersion = await getNextRequirementVersion(job.id);
                updateFields.current_requirement_version = nextVersion;
                updateFields.has_requirements = true;

                const createdGroups = await createGroupsForJob(job.id, nextVersion, groups, transaction);

                const groupMap = {};
                if (groups && Array.isArray(groups)) {
                    for (let i = 0; i < groups.length; i++) {
                        const createdGroup = createdGroups[i];
                        if (createdGroup) {
                            groupMap[groups[i].tempId || i] = createdGroup.id;
                        }
                    }
                }

                const mappedRequirements = (requirements || []).map((req) => ({
                    ...req,
                    group_id: req.group_temp_id !== undefined ? (groupMap[req.group_temp_id] || null) : (req.group_id || null)
                }));

                await createRequirementsForJob(job.id, mappedRequirements, nextVersion, transaction);
            } else if (requirements !== undefined) {
                updateFields.current_requirement_version = 0;
                updateFields.has_requirements = false;
            }

            await db.Job.update(updateFields, {
                where: { id: job.id },
                transaction
            });
        });

        auditService.log({
            actorId: req.user.id,
            actorRole: req.user.role,
            action: hasRequirements ? "job.requirements.updated" : "job.updated",
            targetType: "job",
            targetId: job.id,
            metadata: { previous_version: job.current_requirement_version, new_version: hasRequirements ? (job.current_requirement_version + 1) : 0 },
            ipAddress: req.ip
        });

        const updatedJob = await db.Job.findByPk(job.id, {
            include: hasRequirements ? [
                { model: db.JobRequirement, where: { version: hasRequirements ? (job.current_requirement_version + 1) : 0 }, required: false },
                { model: db.RequirementGroup, where: { version: hasRequirements ? (job.current_requirement_version + 1) : 0 }, required: false }
            ] : []
        });

        res.json(updatedJob);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.getJobs = async (req, res) => {
    try {
        const where = {};

        const isEmployerAdmin = req.user?.role === "admin" && req.user?.admin_scope === "employer";
        const isEmployer = req.user?.role === "employer";

        if (isEmployerAdmin || isEmployer) {
            where.employer_id = req.user.id;
        } else {
            // For public users and non-employer admins, only show active jobs
            where.recruitment_status = "active";
        }

        console.log("=== JOBS ENDPOINT DEBUG ===");
        console.log("Request path:", req.originalUrl);
        console.log("Authenticated user:", JSON.stringify({ id: req.user?.id, role: req.user?.role, admin_scope: req.user?.admin_scope }));
        console.log("Query where clause:", JSON.stringify(where));

        const queryInterface = db.sequelize.getQueryInterface();

        const jobAttributes = getExistingAttributes(
            (await getTableColumns(queryInterface, db.Job.getTableName())) || {},
            [
                "id", "title", "description", "location", "employment_type",
                "course_target", "expected_salary", "employer_id",
                "current_requirement_version", "has_requirements",
                "recruitment_status",
                "createdAt", "updatedAt"
            ],
            ["id", "title", "description", "location", "employment_type", "course_target", "employer_id", "recruitment_status", "createdAt", "updatedAt"]
        );
        const userAttributes = getExistingAttributes(
            (await getTableColumns(queryInterface, db.User.getTableName())) || {},
            ["id", "name", "email", "role", "admin_scope", "admin_avatar_url"],
            ["id", "name", "email", "role"]
        );
        const employerProfileAttributes = getExistingAttributes(
            (await getTableColumns(queryInterface, db.EmployerProfile.getTableName())) || {},
            ["logo_url", "organization_name", "verified"],
            ["logo_url"]
        );
        const alumniProfileAttributes = getExistingAttributes(
            (await getTableColumns(queryInterface, db.AlumniProfile.getTableName())) || {},
            ["avatar_url"],
            ["avatar_url"]
        );

        const jobs = await db.Job.findAll({
            attributes: jobAttributes,
            where,
            include: [
                {
                    model: db.User,
                    attributes: userAttributes,
                    include: [
                        { model: db.EmployerProfile, attributes: employerProfileAttributes },
                        { model: db.AlumniProfile, attributes: alumniProfileAttributes }
                    ]
                }
            ],
            order: [["createdAt", "DESC"]]
        });

        console.log("Jobs returned:", jobs.length);
        console.log("Returned job employer_ids:", JSON.stringify(jobs.map((job) => job.employer_id)));

        const result = await Promise.all(jobs.map(async (job) => {
            const jobJson = job.toJSON();
            if (job.has_requirements && job.current_requirement_version > 0) {
                const requirements = await db.JobRequirement.findAll({
                    where: { job_id: job.id, version: job.current_requirement_version },
                    order: [["sort_order", "ASC"]]
                });
                const groups = await db.RequirementGroup.findAll({
                    where: { job_id: job.id, version: job.current_requirement_version },
                    order: [["sort_order", "ASC"]]
                });
                jobJson.requirements = requirements;
                jobJson.requirement_groups = groups;
            }
            return jobJson;
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.getJobById = async (req, res) => {
    try {
        const job = await db.Job.findByPk(req.params.id);
        if (!job) return res.status(404).json({ msg: "Job not found" });

        const isAdmin = req.user?.role === "admin";
        const isOwner = req.user?.role === "employer" && job.employer_id === req.user.id;
        const isAlumni = req.user?.role === "alumni";

        // Allow alumni to view active jobs, admin/owner to view any job
        if (!isAdmin && !isOwner) {
            if (isAlumni && job.recruitment_status === "active") {
                // Alumni can view active jobs
            } else {
                return res.status(403).json({ msg: "This job is not available." });
            }
        }

        const jobJson = job.toJSON();

        if (job.has_requirements && job.current_requirement_version > 0) {
            const requirements = await db.JobRequirement.findAll({
                where: { job_id: job.id, version: job.current_requirement_version },
                order: [["sort_order", "ASC"]]
            });
            const groups = await db.RequirementGroup.findAll({
                where: { job_id: job.id, version: job.current_requirement_version },
                order: [["sort_order", "ASC"]]
            });
            jobJson.requirements = requirements;
            jobJson.requirement_groups = groups;
        }

        res.json(jobJson);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.getJobRequirements = async (req, res) => {
    try {
        const job = await db.Job.findByPk(req.params.id);
        if (!job) return res.status(404).json({ msg: "Job not found" });

        const version = req.query.version ? parseInt(req.query.version, 10) : job.current_requirement_version;

        if (version === 0 || !job.has_requirements) {
            return res.json({ version: 0, requirements: [], groups: [] });
        }

        const requirements = await db.JobRequirement.findAll({
            where: { job_id: job.id, version },
            order: [["sort_order", "ASC"]]
        });
        const groups = await db.RequirementGroup.findAll({
            where: { job_id: job.id, version },
            order: [["sort_order", "ASC"]]
        });

        res.json({ version, requirements, groups });
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.getRequirementVersions = async (req, res) => {
    try {
        const versions = await db.JobRequirement.findAll({
            attributes: [[db.Sequelize.fn("DISTINCT", db.Sequelize.col("version")), "version"]],
            where: { job_id: req.params.job_id },
            order: [["version", "DESC"]]
        });

        const versionList = versions.map((v) => v.getDataValue("version"));
        res.json(versionList);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.getJobPreview = async (req, res) => {
    try {
        const job = await db.Job.findByPk(req.params.id);
        if (!job) return res.status(404).json({ msg: "Job not found" });

        const isOwner = req.user?.role === "employer" && job.employer_id === req.user.id;
        const isAdmin = req.user?.role === "admin";
        if (!isOwner && !isAdmin) return res.status(403).json({ msg: "Not allowed." });

        if (!job.has_requirements || job.current_requirement_version === 0) {
            return res.json({
                has_requirements: false,
                message: "This job uses the legacy application system. No dynamic requirements configured."
            });
        }

        const requirements = await db.JobRequirement.findAll({
            where: { job_id: job.id, version: job.current_requirement_version },
            order: [["sort_order", "ASC"]]
        });
        const groups = await db.RequirementGroup.findAll({
            where: { job_id: job.id, version: job.current_requirement_version },
            order: [["sort_order", "ASC"]]
        });

        const groupedPreview = groups.map((group) => ({
            group_label: group.group_label,
            sort_order: group.sort_order,
            requirements: requirements
                .filter((r) => r.group_id === group.id)
                .map((r) => ({
                    requirement_code: r.requirement_code,
                    label: r.label,
                    description: r.description,
                    requirement_type: r.requirement_type,
                    value_type: r.value_type,
                    value_options: r.value_options,
                    required: r.required,
                    allowed_types: r.allowed_types,
                    max_file_size: r.max_file_size,
                    sort_order: r.sort_order
                }))
        }));

        const ungrouped = requirements
            .filter((r) => !r.group_id)
            .map((r) => ({
                requirement_code: r.requirement_code,
                label: r.label,
                description: r.description,
                requirement_type: r.requirement_type,
                value_type: r.value_type,
                value_options: r.value_options,
                required: r.required,
                allowed_types: r.allowed_types,
                max_file_size: r.max_file_size,
                sort_order: r.sort_order
            }));

        res.json({
            job_id: job.id,
            title: job.title,
            version: job.current_requirement_version,
            groups: groupedPreview,
            ungrouped
        });
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.stopRecruitment = async (req, res) => {
    try {
        const resolvedJobId = req.params.jobId || req.params.id;

        console.log("=== STOP RECRUITMENT DEBUG ===");
        console.log("req.originalUrl:", req.originalUrl);
        console.log("req.params:", JSON.stringify(req.params));
        console.log("resolvedJobId:", resolvedJobId);
        console.log("typeof resolvedJobId:", typeof resolvedJobId);

        const job = await db.Job.findByPk(resolvedJobId);

        console.log("Job table:", db.Job.getTableName());
        console.log("Job.findByPk result:", job ? { id: job.id, recruitment_status: job.recruitment_status } : null);

        if (!job) {
            console.log("=== 404 RETURNED HERE ===");
            console.log("Querying table:", db.Job.getTableName());
            const directCount = await db.sequelize.query(`SELECT COUNT(*) as cnt FROM ${db.Job.getTableName()} WHERE id = :id`, { replacements: { id: resolvedJobId }, type: "SELECT" });
            console.log("Direct SQL count result:", directCount);
            return res.status(404).json({ msg: "Job not found" });
        }

        const isOwner = req.user?.role === "employer" && job.employer_id === req.user.id;
        const isAdminEmployer = req.user?.role === "admin" && req.user?.admin_scope === "employer";
        const isSuperAdmin = req.user?.role === "admin" && !req.user?.admin_scope;

        if (!isOwner && !isAdminEmployer && !isSuperAdmin) {
            return res.status(403).json({ msg: "Not allowed." });
        }

        if (job.recruitment_status === "closed") {
            return res.status(400).json({ msg: "Recruitment is already stopped for this job." });
        }

        job.recruitment_status = "closed";
        await job.save();

        auditService.log({
            actorId: req.user.id,
            actorRole: req.user.role,
            action: "job.recruitment.stopped",
            targetType: "job",
            targetId: job.id,
            ipAddress: req.ip
        });

        res.json(job);
    } catch (err) {
        console.error("Stop recruitment error:", err);
        res.status(500).json({ msg: err.message });
    }
};

exports.reactivateRecruitment = async (req, res) => {
    try {
        const jobId = req.params.jobId || req.params.id;

        const job = await db.Job.findByPk(jobId);

        if (!job) return res.status(404).json({ msg: "Job not found" });

        const isOwner = req.user?.role === "employer" && job.employer_id === req.user.id;
        const isAdminEmployer = req.user?.role === "admin" && req.user?.admin_scope === "employer";
        const isSuperAdmin = req.user?.role === "admin" && !req.user?.admin_scope;

        if (!isOwner && !isAdminEmployer && !isSuperAdmin) {
            return res.status(403).json({ msg: "Not allowed." });
        }

        if (job.recruitment_status === "active") {
            return res.status(400).json({ msg: "Recruitment is already active for this job." });
        }

        const nextCycle = (parseInt(await db.Application.max("recruitment_cycle", { where: { job_id: job.id } }) || "0") + 1);

        await db.sequelize.transaction(async (transaction) => {
            job.recruitment_status = "active";
            await job.save({ transaction });

            await db.Application.update(
                { recruitment_cycle: nextCycle },
                { where: { job_id: job.id }, transaction }
            );
        });

        auditService.log({
            actorId: req.user.id,
            actorRole: req.user.role,
            action: "job.recruitment.reactivated",
            targetType: "job",
            targetId: job.id,
            metadata: { new_cycle: nextCycle },
            ipAddress: req.ip
        });

        const updated = await db.Job.findByPk(job.id);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.deleteJob = async (req, res) => {
    try {
        const job = await db.Job.findByPk(req.params.id);
        if (!job) return res.status(404).json({ msg: "Job not found" });

        const isOwner = req.user?.role === "employer" && job.employer_id === req.user.id;
        if (!isOwner) return res.status(403).json({ msg: "Not allowed." });

        await db.Application.destroy({ where: { job_id: job.id } });
        await db.JobRequirement.destroy({ where: { job_id: job.id } });
        await db.RequirementGroup.destroy({ where: { job_id: job.id } });
        await job.destroy();

        auditService.log({
            actorId: req.user.id,
            actorRole: "employer",
            action: "job.deleted",
            targetType: "job",
            targetId: job.id,
            ipAddress: req.ip
        });

        res.json({ msg: "Job deleted." });
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};