const db = require("../models");
const notificationController = require("./notificationController");
const { encrypt, decrypt } = require("../utils/fieldEncryption");
const { toSecureFileUrl } = require("./fileController");
const auditService = require("../services/auditService");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const {
    Resume, ResumePersonalInfo, ResumeSummary, ResumeEducation, ResumeWorkExperience,
    ResumeSkill, ResumeProject, ResumeCertification, ResumeTraining, ResumeSeminar,
    ResumeAward, ResumeOrganization, ResumeVolunteerWork, ResumeLanguage, ResumeReference
} = require("../models");

const hydrateSensitiveFields = (application) => {
    const plain = application.toJSON ? application.toJSON() : { ...application };
    ["sss_no", "philhealth_no", "pagibig_no", "tin"].forEach((key) => {
        plain[key] = decrypt(plain[key]);
    });
    plain.resume_path = toSecureFileUrl(plain.resume_path);
    plain.transcript_path = toSecureFileUrl(plain.transcript_path);
    plain.certificate_path = toSecureFileUrl(plain.certificate_path);
    // Normalize ApplicationDocument file_path values
    if (plain.ApplicationDocuments && Array.isArray(plain.ApplicationDocuments)) {
        plain.ApplicationDocuments = plain.ApplicationDocuments.map((doc) => {
            if (doc && doc.file_path) {
                return { ...doc, file_path: toSecureFileUrl(doc.file_path) };
            }
            return doc;
        });
    }
    return plain;
};

// Helper: build resume snapshot
const createResumeSnapshot = async (resumeId) => {
    const resume = await Resume.findByPk(resumeId);
    if (!resume) return null;

    const [personalInfo, summary, education, workExperience, skills, projects, certifications,
        trainings, seminars, awards, organizations, volunteerWork, languages, references] = await Promise.all([
            ResumePersonalInfo.findOne({ where: { resume_id: resumeId } }),
            ResumeSummary.findOne({ where: { resume_id: resumeId } }),
            ResumeEducation.findAll({ where: { resume_id: resumeId } }),
            ResumeWorkExperience.findAll({ where: { resume_id: resumeId } }),
            ResumeSkill.findAll({ where: { resume_id: resumeId } }),
            ResumeProject.findAll({ where: { resume_id: resumeId } }),
            ResumeCertification.findAll({ where: { resume_id: resumeId } }),
            ResumeTraining.findAll({ where: { resume_id: resumeId } }),
            ResumeSeminar.findAll({ where: { resume_id: resumeId } }),
            ResumeAward.findAll({ where: { resume_id: resumeId } }),
            ResumeOrganization.findAll({ where: { resume_id: resumeId } }),
            ResumeVolunteerWork.findAll({ where: { resume_id: resumeId } }),
            ResumeLanguage.findAll({ where: { resume_id: resumeId } }),
            ResumeReference.findAll({ where: { resume_id: resumeId } })
        ]);

    return {
        resume: resume.toJSON(),
        personalInfo: personalInfo?.toJSON(),
        summary: summary?.toJSON(),
        education: education.map(e => e.toJSON()),
        workExperience: workExperience.map(e => e.toJSON()),
        skills: skills.map(e => e.toJSON()),
        projects: projects.map(e => e.toJSON()),
        certifications: certifications.map(e => e.toJSON()),
        trainings: trainings.map(e => e.toJSON()),
        seminars: seminars.map(e => e.toJSON()),
        awards: awards.map(e => e.toJSON()),
        organizations: organizations.map(e => e.toJSON()),
        volunteerWork: volunteerWork.map(e => e.toJSON()),
        languages: languages.map(e => e.toJSON()),
        references: references.map(e => e.toJSON()),
        captured_at: new Date()
    };
};

// Helper: build snapshot data from job requirements
const buildSnapshotData = async (jobId, version) => {
    const requirements = await db.JobRequirement.findAll({
        where: { job_id: jobId, version },
        order: [["sort_order", "ASC"]]
    });

    const groups = await db.RequirementGroup.findAll({
        where: { job_id: jobId, version },
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

    return { version, groups: groupedPreview, ungrouped };
};

// APPLY TO JOB
exports.applyJob = async (req, res, next) => {
    try {
        const {
            job_id,
            position_applied_for,
            department_office,
            employment_type,
            preferred_work_location,
            expected_salary,
            start_date,
            full_name,
            email,
            dob,
            place_of_birth,
            gender,
            contact_number,
            nationality,
            address,
            professional_summary,
            civil_service_eligibility,
            rating,
            license_number,
            validity,
            education,
            school,
            degree,
            years_attended,
            honors,
            company,
            position,
            employment_period,
            responsibilities,
            achievements,
            reason_for_leaving,
            skills,
            soft_skills,
            certifications,
            leadership_role,
            people_managed,
            leadership_achievements,
            training_title,
            training_organization,
            training_duration,
            training_date,
            reference_name,
            reference_position,
            reference_company,
            reference_contact,
            civil_status,
            disability,
            disability_other,
            employment_status,
            employment_type_detail,
            ofw,
            former_ofw,
            four_ps,
            preferred_occupation,
            preferred_work_type,
            preferred_location_type,
            preferred_location_detail,
            languages,
            currently_in_school,
            education_level,
            work_status,
            other_skills,
            other_skills_other,
            convicted_of_crime,
            dismissed_from_service,
            currently_employed,
            can_work_overtime,
            why_join,
            good_fit,
            career_goals,
            declaration_confirmed,
            notes,
            sss_no,
            philhealth_no,
            pagibig_no,
            tin
        } = req.body;

        const jobId = Number(job_id);
        if (!jobId) return res.status(400).json({ msg: "job_id is required." });

        const alumni = await db.User.findByPk(req.user.id);
        if (!alumni || alumni.role !== "alumni") {
            return res.status(403).json({ msg: "Alumni access only." });
        }

        if (alumni.account_status !== "verified") {
            return res.status(403).json({ msg: "Your alumni account must be verified before applying." });
        }

        const job = await db.Job.findByPk(jobId);
        if (!job) {
            return res.status(404).json({ msg: "Job not found." });
        }

        if (job.recruitment_status === "closed") {
            return res.status(403).json({ msg: "Recruitment for this job has been stopped." });
        }

        const existing = await db.Application.findOne({
            where: { job_id: jobId, alumni_id: req.user.id }
        });

        if (existing) {
            return res.status(400).json({ msg: "You already applied to this job." });
        }

        // ── BRANCH A: Legacy job (no requirements) ──
        if (!job.has_requirements || job.current_requirement_version === 0) {
            const resumeFile = req.files?.resume?.[0];
            const transcriptFile = req.files?.transcript?.[0];
            const certificateFile = req.files?.certificate?.[0];

            const resumeId = req.body?.resume_id;
            let resumePath = null;
            let resumeSnapshot = null;

            if (resumeId) {
                const alumniResume = await db.Resume.findOne({ where: { id: resumeId, user_id: req.user.id } });
                if (!alumniResume) {
                    return res.status(400).json({ msg: "Selected resume not found." });
                }
                resumePath = `/uploads/resumes/${alumniResume.id}.json`;
                resumeSnapshot = await createResumeSnapshot(alumniResume.id);
            } else if (resumeFile) {
                resumePath = resumeFile.storageRef || resumeFile.path || `/uploads/resumes/${resumeFile.filename}`;
            }

            const toStoredPath = (file, folder) =>
                file
                    ? file.storageRef || file.path || `/uploads/${folder}/${file.filename}`
                    : null;

            const currentCycle = await db.Application.max("recruitment_cycle", { where: { job_id: jobId } }) || 1;

            const application = await db.Application.create({
                job_id: jobId,
                alumni_id: req.user.id,
                position_applied_for,
                department_office,
                employment_type,
                preferred_work_location,
                expected_salary,
                start_date,
                full_name: full_name || alumni.name,
                email: email || alumni.email,
                dob, place_of_birth, gender, contact_number, nationality, address,
                professional_summary,
                civil_service_eligibility, rating, license_number, validity,
                education, school, degree, years_attended, honors,
                company, position, employment_period, responsibilities, achievements, reason_for_leaving,
                skills, soft_skills, certifications,
                leadership_role, people_managed, leadership_achievements,
                training_title, training_organization, training_duration, training_date,
                reference_name, reference_position, reference_company, reference_contact,
                civil_status, disability, disability_other,
                employment_status, employment_type_detail, ofw, former_ofw, four_ps,
                preferred_occupation, preferred_work_type, preferred_location_type, preferred_location_detail,
                languages, currently_in_school, education_level, work_status,
                other_skills, other_skills_other,
                convicted_of_crime, dismissed_from_service, currently_employed, can_work_overtime,
                why_join, good_fit, career_goals, declaration_confirmed, notes,
                sss_no: encrypt(sss_no),
                philhealth_no: encrypt(philhealth_no),
                pagibig_no: encrypt(pagibig_no),
                tin: encrypt(tin),
                resume_path: resumePath,
                resume_snapshot: resumeSnapshot,
                transcript_path: toStoredPath(transcriptFile, "documents"),
                certificate_path: toStoredPath(certificateFile, "documents"),
                status: "pending",
                recruitment_cycle: currentCycle
            });

            return res.json(hydrateSensitiveFields(application));
        }

        // ── BRANCH B: Job has dynamic requirements ──
        const resumeId = req.body?.resume_id;
        let resumeSnapshot = null;
        if (resumeId) {
            const alumniResume = await db.Resume.findOne({ where: { id: resumeId, user_id: req.user.id } });
            if (!alumniResume) {
                return res.status(400).json({ msg: "Selected resume not found." });
            }
            resumeSnapshot = await createResumeSnapshot(alumniResume.id);
        }

        const version = job.current_requirement_version;
        const jobRequirements = await db.JobRequirement.findAll({
            where: { job_id: jobId, version }
        });

        if (!jobRequirements.length) {
            return res.status(400).json({ msg: "This job has no requirements configured." });
        }

        // Validate required document uploads
        const docRequirements = jobRequirements.filter((r) => r.requirement_type === "document_upload" && r.required);
        for (const requirement of docRequirements) {
            const fieldName = `requirement_${requirement.requirement_code}`;
            const file = req.files?.[fieldName]?.[0];

            if (!file) {
                return res.status(400).json({
                    msg: `Required document "${requirement.label}" is missing.`,
                    requirement_code: requirement.requirement_code
                });
            }
        }

        // Validate required information fields
        const infoRequirements = jobRequirements.filter((r) => r.requirement_type === "information_field" && r.required);
        for (const requirement of infoRequirements) {
            const fieldName = `requirement_${requirement.requirement_code}`;
            const value = req.body?.[fieldName] || req.body?.[`requirement_${requirement.requirement_code}`];
            if (!value || !String(value).trim()) {
                return res.status(400).json({
                    msg: `Required information "${requirement.label}" is missing.`,
                    requirement_code: requirement.requirement_code
                });
            }
        }

        // Build snapshot
        const snapshotData = await buildSnapshotData(jobId, version);

        // Create application with snapshot
        const currentCycle = await db.Application.max("recruitment_cycle", { where: { job_id: jobId } }) || 1;

        const application = await db.sequelize.transaction(async (transaction) => {
            const app = await db.Application.create({
                job_id: jobId,
                alumni_id: req.user.id,
                full_name: full_name || alumni.name,
                email: email || alumni.email,
                status: "pending",
                recruitment_cycle: currentCycle
            }, { transaction });

            // Save snapshot
            await db.JobRequirementSnapshot.create({
                application_id: app.id,
                job_id: jobId,
                version,
                snapshot_data: snapshotData
            }, { transaction });

            // Save document uploads
            const docReqs = jobRequirements.filter((r) => r.requirement_type === "document_upload");
            for (const requirement of docReqs) {
                const fieldName = `requirement_${requirement.requirement_code}`;
                const file = req.files?.[fieldName]?.[0];
                if (file) {
                    const filePath = file.storageRef || file.path || `/uploads/documents/${file.filename}`;
                    await db.ApplicationDocument.create({
                        application_id: app.id,
                        requirement_code: requirement.requirement_code,
                        file_path: filePath,
                        file_name: file.originalname || file.filename,
                        file_size: file.size || null,
                        mime_type: file.mimetype || null,
                        review_status: "pending_review",
                        version: 1
                    }, { transaction });
                }
            }

            // Save information field responses
            const infoReqs = jobRequirements.filter((r) => r.requirement_type === "information_field");
            for (const requirement of infoReqs) {
                const fieldName = `requirement_${requirement.requirement_code}`;
                const value = req.body?.[fieldName] || req.body?.[`requirement_${requirement.requirement_code}`];
                if (value !== undefined && value !== null) {
                    await db.ApplicationResponse.create({
                        application_id: app.id,
                        requirement_code: requirement.requirement_code,
                        response_value: String(value),
                        review_status: "pending_review",
                        version: 1
                    }, { transaction });
                }
            }

            return app;
        });

        // Audit log
        auditService.log({
            actorId: req.user.id,
            actorRole: "alumni",
            action: "application.submitted",
            targetType: "application",
            targetId: application.id,
            metadata: { job_id: jobId, snapshot_version: version },
            ipAddress: req.ip
        });

        // Fetch and return the full application with snapshot
        const result = await db.Application.findByPk(application.id, {
            include: [
                { model: db.JobRequirementSnapshot },
                { model: db.ApplicationDocument },
                { model: db.ApplicationResponse }
            ]
        });

        res.json(result);
    } catch (err) {
        next(err);
    }
};

// GET ALL APPLICATIONS FOR USER
exports.getApplications = async (req, res, next) => {
    try {
        const apps = await db.Application.findAll({
            where: { alumni_id: req.user.id },
            include: [
                { model: db.Job },
                { model: db.JobRequirementSnapshot },
                { model: db.ApplicationDocument },
                { model: db.ApplicationResponse }
            ]
        });
        res.json(apps.map(hydrateSensitiveFields));
    } catch (err) {
        next(err);
    }
};

// GET APPLICANTS FOR A SPECIFIC JOB
exports.getJobApplicants = async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const isEmployerAdmin = req.user.role === "admin" && req.user.admin_scope === "employer";
        if (req.user.role !== "employer" && !isEmployerAdmin) {
            return res.status(403).json({ msg: "Employer access only." });
        }

        console.log("=== GET JOB APPLICANTS DEBUG ===");
        console.log("Endpoint: GET /api/applications/jobs/:jobId/applicants");
        console.log("Authenticated user:", JSON.stringify({ id: req.user?.id, role: req.user?.role, admin_scope: req.user?.admin_scope }));
        console.log("Requested jobId:", jobId);

        const job = await db.Job.findByPk(jobId);
        if (!job) {
            return res.status(404).json({ msg: "Job not found." });
        }

        if (job.employer_id !== req.user.id) {
            return res.status(403).json({ msg: "Not allowed." });
        }

        const currentCycle = await db.Application.max("recruitment_cycle", { where: { job_id: jobId } }) || 1;

        const appWhere = { job_id: jobId, recruitment_cycle: currentCycle };
        if (job.recruitment_status === "closed") {
            appWhere.status = "verified";
        }

        const apps = await db.Application.findAll({
            where: appWhere,
            include: [
                {
                    model: db.User,
                    as: "alumni",
                    attributes: ["id", "name", "email", "role"],
                    include: [
                        {
                            model: db.AlumniProfile,
                            include: [{ model: db.EmploymentHistory }]
                        }
                    ]
                },
                { model: db.JobRequirementSnapshot },
                { model: db.ApplicationDocument },
                { model: db.ApplicationResponse }
            ],
            order: [["createdAt", "DESC"]]
        });

        console.log("=== GET JOB APPLICANTS DEBUG ===");
        console.log("Applications returned:", apps.length);
        console.log("Application job ids:", JSON.stringify(apps.map((app) => app.job_id)));

        res.json(apps.map(hydrateSensitiveFields));
    } catch (err) {
        next(err);
    }
};

// GET APPLICATIONS RECEIVED BY EMPLOYER
exports.getEmployerApplications = async (req, res, next) => {
    try {
        const isEmployerAdmin = req.user.role === "admin" && req.user.admin_scope === "employer";
        if (req.user.role !== "employer" && !isEmployerAdmin) {
            return res.status(403).json({ msg: "Employer access only." });
        }

        const jobWhere = { employer_id: req.user.id };
 
        console.log("=== GET EMPLOYER APPLICATIONS DEBUG ===");
        console.log("Request path:", req.originalUrl);
        console.log("Authenticated user:", JSON.stringify({ id: req.user?.id, role: req.user?.role, admin_scope: req.user?.admin_scope }));
        console.log("Job where clause:", JSON.stringify(jobWhere));

        const apps = await db.Application.findAll({
            include: [
                {
                    model: db.Job,
                    where: jobWhere
                },
                {
                    model: db.User,
                    as: "alumni",
                    attributes: ["id", "name", "email", "role"],
                    include: [
                        {
                            model: db.AlumniProfile,
                            include: [{ model: db.EmploymentHistory }]
                        }
                    ]
                },
                { model: db.JobRequirementSnapshot },
                { model: db.ApplicationDocument },
                { model: db.ApplicationResponse }
            ],
            order: [["createdAt", "DESC"]]
        });

        const filtered = apps.filter((app) => {
            const job = app.Job;
            if (!job) return false;
 
            if (job.recruitment_status === "closed") {
                return app.status === "verified";
            }
 
            return true;
        });

        console.log("=== GET EMPLOYER APPLICATIONS DEBUG ===");
        console.log("Applications returned after filtering:", filtered.length);
        console.log("Returned application job employer_ids:", JSON.stringify(filtered.map((app) => app.Job?.employer_id)));
 
        res.json(filtered.map(hydrateSensitiveFields));
    } catch (err) {
        next(err);
    }
};

// REVIEW A SINGLE REQUIREMENT (employer only)
exports.reviewRequirement = async (req, res, next) => {
    try {
        const isEmployerAdmin = req.user.role === "admin" && req.user.admin_scope === "employer";
        if (req.user.role !== "employer" && !isEmployerAdmin) {
            return res.status(403).json({ msg: "Employer access only." });
        }

        const { id, code } = req.params;
        const { status, notes } = req.body;

        const allowedStatuses = ["approved", "rejected", "needs_revision"];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ msg: "Invalid review status. Use: approved, rejected, or needs_revision." });
        }

        const application = await db.Application.findByPk(id, {
            include: [{ model: db.Job }]
        });

        if (!application) {
            return res.status(404).json({ msg: "Application not found." });
        }

        if (application.Job?.employer_id !== req.user.id && !isEmployerAdmin) {
            return res.status(403).json({ msg: "You can only review applications for your own jobs." });
        }

        // Try to update document or response
        let updated = false;

        const doc = await db.ApplicationDocument.findOne({
            where: { application_id: id, requirement_code: code }
        });

        if (doc) {
            doc.review_status = status;
            doc.review_notes = notes || null;
            doc.reviewed_by = req.user.id;
            doc.reviewed_at = new Date();
            await doc.save();
            updated = true;

            auditService.log({
                actorId: req.user.id,
                actorRole: "employer",
                action: status === "needs_revision" ? "application.document.revision_requested" : `application.document.${status}`,
                targetType: "document",
                targetId: doc.id,
                requirementCode: code,
                metadata: { notes },
                ipAddress: req.ip
            });
        }

        const resp = await db.ApplicationResponse.findOne({
            where: { application_id: id, requirement_code: code }
        });

        if (resp) {
            resp.review_status = status;
            resp.review_notes = notes || null;
            resp.reviewed_by = req.user.id;
            resp.reviewed_at = new Date();
            await resp.save();
            updated = true;

            auditService.log({
                actorId: req.user.id,
                actorRole: "employer",
                action: status === "needs_revision" ? "application.response.revision_requested" : `application.response.${status}`,
                targetType: "response",
                targetId: resp.id,
                requirementCode: code,
                metadata: { notes },
                ipAddress: req.ip
            });
        }

        if (!updated) {
            return res.status(404).json({ msg: `Requirement "${code}" not found in this application.` });
        }

        // Notify applicant if revision requested
        if (status === "needs_revision") {
            await notificationController.createNotification({
                userIds: [application.alumni_id],
                type: "application",
                message: `Your ${code} requires revision. ${notes ? `Notes: ${notes}` : ""}`,
                subject: "Application Revision Required"
            });
        }

        res.json({ msg: `Requirement "${code}" reviewed as "${status}".` });
    } catch (err) {
        next(err);
    }
};

// GET REVIEW STATUS FOR ALL REQUIREMENTS
exports.getRequirementReviewStatus = async (req, res, next) => {
    try {
        const application = await db.Application.findByPk(req.params.id, {
            include: [
                { model: db.JobRequirementSnapshot },
                { model: db.ApplicationDocument },
                { model: db.ApplicationResponse }
            ]
        });

        if (!application) {
            return res.status(404).json({ msg: "Application not found." });
        }

        const snapshot = application.JobRequirementSnapshot;
        if (!snapshot) {
            return res.json({ has_requirements: false, message: "Legacy application without dynamic requirements." });
        }

        const snapshotData = snapshot.snapshot_data;
        const allRequirements = [
            ...(snapshotData.groups || []).flatMap((g) => g.requirements || []),
            ...(snapshotData.ungrouped || [])
        ];

        const statuses = allRequirements.map((req) => {
            const doc = (application.ApplicationDocuments || []).find((d) => d.requirement_code === req.requirement_code);
            const resp = (application.ApplicationResponses || []).find((r) => r.requirement_code === req.requirement_code);

            return {
                requirement_code: req.requirement_code,
                label: req.label,
                requirement_type: req.requirement_type,
                required: req.required,
                review_status: doc?.review_status || resp?.review_status || "not_submitted",
                review_notes: doc?.review_notes || resp?.review_notes || null,
                version: doc?.version || resp?.version || 0,
                has_file: !!doc,
                has_response: !!resp
            };
        });

        res.json({
            application_id: application.id,
            snapshot_version: snapshot.version,
            overall_status: application.status,
            requirements: statuses
        });
    } catch (err) {
        next(err);
    }
};

// REVIEW AN APPLICATION (employer only) — overall status
exports.reviewApplication = async (req, res, next) => {
    try {
        const isEmployerAdmin = req.user.role === "admin" && req.user.admin_scope === "employer";
        if (req.user.role !== "employer" && !isEmployerAdmin) {
            return res.status(403).json({ msg: "Employer access only." });
        }

        const { status, venue, place, date, time, contact_info, what_to_bring } = req.body;
        const normalizedStatus = String(status || "").toLowerCase();
        const allowed = ["verified", "not_verified"];
        if (!allowed.includes(normalizedStatus)) {
            return res.status(400).json({ msg: "Invalid review status." });
        }

        if (normalizedStatus === "verified") {
            const requiredFields = { venue, place, date, time, contact_info };
            const missingField = Object.entries(requiredFields).find(([, value]) => !String(value || "").trim());
            if (missingField) {
                return res.status(400).json({ msg: `${missingField[0]} is required.` });
            }
        }

        const application = await db.Application.findByPk(req.params.id, {
            include: [
                { model: db.Job },
                {
                    model: db.User,
                    as: "alumni",
                    attributes: ["id", "name", "email"]
                }
            ]
        });

        if (!application) {
            return res.status(404).json({ msg: "Application not found." });
        }

        if (application.Job?.employer_id !== req.user.id && !isEmployerAdmin) {
            return res.status(403).json({ msg: "You can only review applications for your own jobs." });
        }

        application.status = normalizedStatus;
        await application.save();

        let interview = null;
        if (normalizedStatus === "verified") {
            interview = await db.Interview.create({
                application_id: application.id,
                venue: String(venue).trim(),
                place: String(place).trim(),
                date,
                time: String(time).trim(),
                contact_info: String(contact_info).trim(),
                what_to_bring: String(what_to_bring || "").trim() || null
            });
        }

        const employer = await db.User.findByPk(req.user.id, {
            include: [{ model: db.EmployerProfile }]
        });

        const orgName = employer?.EmployerProfile?.organization_name || employer?.name || "Employer";

        const approvedMessage =
            `You are qualified for ${application.Job?.title || "the job"}.\n` +
            `Please visit our office.\n` +
            `Organization: ${orgName}\nAddress: ${String(place || "").trim()}\nEmail: ${String(contact_info || "").trim()}`;

        const rejectedMessage =
            `Sorry, we are not satisfied for the role you applied.\n` +
            `Role: ${application.Job?.title || "N/A"}\nOrganization: ${orgName}`;

        const emailMessage = normalizedStatus === "verified" ? approvedMessage : rejectedMessage;
        const subject =
            normalizedStatus === "verified"
                ? "Job Application Update: Qualified"
                : "Job Application Update";

        await notificationController.createNotification({
            userIds: [application.alumni_id],
            type: normalizedStatus === "verified" ? "interview" : "application",
            message: emailMessage,
            subject,
            interview_id: interview?.id || null
        });

        res.json({ msg: "Application reviewed.", application: hydrateSensitiveFields(application), interview });
    } catch (err) {
        next(err);
    }
};

// DOWNLOAD ALL APPLICATION DOCUMENTS AS ZIP
exports.downloadApplicationDocuments = async (req, res, next) => {
    try {
        const application = await db.Application.findByPk(req.params.id, {
            include: [
                { model: db.Job },
                { model: db.ApplicationDocument }
            ]
        });

        if (!application) {
            return res.status(404).json({ msg: "Application not found." });
        }

        // Authorization
        const isOwner = req.user.role === "employer" && application.Job?.employer_id === req.user.id;
        const isApplicant = req.user.role === "alumni" && application.alumni_id === req.user.id;
        const isAdmin = req.user.role === "admin";
        if (!isOwner && !isApplicant && !isAdmin) {
            return res.status(403).json({ msg: "Not allowed." });
        }

        const documents = application.ApplicationDocuments || [];
        if (documents.length === 0) {
            return res.status(400).json({ msg: "No documents available for download." });
        }

        // Set response headers
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="application-${application.id}-documents.zip"`);

        const archive = archiver("zip", { zlib: { level: 5 } });
        archive.on("error", (err) => { throw err; });

        archive.pipe(res);

        let fileCount = 0;
        const missingFiles = [];

        for (const doc of documents) {
            const filePath = doc.file_path;
            // Handle both local and cloud storage paths
            if (filePath && !filePath.startsWith("http") && !filePath.startsWith("stored://")) {
                const absolutePath = path.isAbsolute(filePath)
                    ? filePath
                    : path.join(__dirname, "..", filePath);

                try {
                    if (fs.existsSync(absolutePath)) {
                        const archiveName = `${doc.requirement_code}_${doc.file_name}`;
                        archive.file(absolutePath, { name: archiveName });
                        fileCount++;
                    } else {
                        missingFiles.push(doc.requirement_code);
                    }
                } catch {
                    missingFiles.push(doc.requirement_code);
                }
            } else if (filePath && filePath.startsWith("http")) {
                // For cloud URLs, we'd need to fetch and stream — skip for now
                missingFiles.push(doc.requirement_code);
            }
        }

        if (fileCount === 0) {
            archive.abort();
            return res.status(400).json({ msg: "No downloadable files found." });
        }

        await archive.finalize();

        // Audit log
        auditService.log({
            actorId: req.user.id,
            actorRole: req.user.role,
            action: "application.documents.downloaded",
            targetType: "application",
            targetId: application.id,
            metadata: { total_files: fileCount, missing_files: missingFiles },
            ipAddress: req.ip
        });
    } catch (err) {
        next(err);
    }
};