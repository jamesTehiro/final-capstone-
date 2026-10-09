const { Resume, ResumePersonalInfo, ResumeSummary, ResumeEducation, ResumeWorkExperience,
    ResumeSkill, ResumeProject, ResumeCertification, ResumeTraining, ResumeSeminar,
    ResumeAward, ResumeOrganization, ResumeVolunteerWork, ResumeLanguage, ResumeReference, ResumeVersion } = require("../models");
const authMiddleware = require("../middleware/authMiddleware");

// Helper to sanitize user input
const sanitize = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<[^>]*>/g, '')
        .trim();
};

// Ensure one default resume per user
const ensureDefaultResume = async (userId, excludeId = null) => {
    const defaultResumes = await Resume.findAll({
        where: {
            user_id: userId,
            is_default: true,
            ...(excludeId && { id: { [require('sequelize').Op.ne]: excludeId } })
        }
    });
    for (const r of defaultResumes) {
        if (defaultResumes.length === 1) break;
        r.is_default = false;
        await r.save();
    }
};

exports.getResumes = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const resumes = await Resume.findAll({
            where: { user_id: userId, is_archived: false },
            order: [["createdAt", "DESC"]]
        });

        const populated = await Promise.all(resumes.map(async (r) => {
            const personalInfo = await ResumePersonalInfo.findOne({ where: { resume_id: r.id } });
            return {
                ...r.toJSON(),
                personalInfo: personalInfo ? { full_name: personalInfo.full_name } : null
            };
        }));

        res.json({ data: populated });
    } catch (err) {
        console.error("getResumes error:", err);
        res.status(500).json({ message: "Failed to fetch resumes" });
    }
};

exports.getResume = async (req, res) => {
    try {
        const userId = req.user?.id;
        const resumeId = req.params.id;

        const resume = await Resume.findOne({ where: { id: resumeId, user_id: userId } });
        if (!resume) return res.status(404).json({ message: "Resume not found" });

        const [personalInfo, summary, education, workExperience, skills, projects, certifications,
            trainings, seminars, awards, organizations, volunteerWork, languages, references] = await Promise.all([
                ResumePersonalInfo.findOne({ where: { resume_id: resumeId } }),
                ResumeSummary.findOne({ where: { resume_id: resumeId } }),
                ResumeEducation.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] }),
                ResumeWorkExperience.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] }),
                ResumeSkill.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] }),
                ResumeProject.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] }),
                ResumeCertification.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] }),
                ResumeTraining.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] }),
                ResumeSeminar.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] }),
                ResumeAward.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] }),
                ResumeOrganization.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] }),
                ResumeVolunteerWork.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] }),
                ResumeLanguage.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] }),
                ResumeReference.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] })
            ]);

        res.json({
            ...resume.toJSON(),
            personalInfo: personalInfo || {},
            summary: summary || {},
            education: education || [],
            workExperience: workExperience || [],
            skills: skills || [],
            projects: projects || [],
            certifications: certifications || [],
            trainings: trainings || [],
            seminars: seminars || [],
            awards: awards || [],
            organizations: organizations || [],
            volunteerWork: volunteerWork || [],
            languages: languages || [],
            references: references || []
        });
    } catch (err) {
        console.error("getResume error:", err);
        res.status(500).json({ message: "Failed to fetch resume" });
    }
};

exports.createResume = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { title, template_id, font_family, font_size, line_spacing, color_theme, settings, is_default } = req.body;

        console.log(`[RESUME CREATE] Timestamp: ${new Date().toISOString()}, UserID: ${userId}, Title: ${title || 'My Resume'}, IP: ${req.ip}`);

        if (is_default) await ensureDefaultResume(userId);

        const resume = await Resume.create({
            user_id: userId,
            title: sanitize(title) || 'My Resume',
            template_id: template_id || 'modern-professional',
            font_family: font_family || 'Inter, sans-serif',
            font_size: font_size || 11,
            line_spacing: line_spacing || 1.5,
            color_theme: color_theme || '#155a43',
            settings: settings || {},
            is_default: is_default || false
        });

        res.status(201).json({ data: resume });
    } catch (err) {
        console.error("createResume error:", err);
        res.status(500).json({ message: "Failed to create resume" });
    }
};

// Helper to save resume section data (personalInfo, education, workExperience, etc.)
const saveResumeSections = async (resumeId, body) => {
    const saveOneToOne = async (Model, data) => {
        if (!data) return;
        const existing = await Model.findOne({ where: { resume_id: resumeId } });
        if (existing) {
            await existing.update(data);
        } else {
            await Model.create({ resume_id: resumeId, ...data });
        }
    };

    const saveOneToMany = async (Model, items) => {
        if (!Array.isArray(items)) return;
        // Delete existing records for this resume and recreate
        await Model.destroy({ where: { resume_id: resumeId } });
        for (const item of items) {
            await Model.create({ resume_id: resumeId, ...item });
        }
    };

    if (body.personalInfo) {
        const pi = body.personalInfo;
        await saveOneToOne(ResumePersonalInfo, {
            full_name: pi.full_name || '',
            email: pi.email || '',
            phone: pi.phone || '',
            address: pi.address || '',
            linkedin: pi.linkedin || '',
            website: pi.website || '',
            profile_picture: pi.profile_picture || ''
        });
    }

    if (body.summary) {
        const sm = body.summary;
        await saveOneToOne(ResumeSummary, {
            content: sm.content || ''
        });
    }

    if (body.education) {
        await saveOneToMany(ResumeEducation, body.education.map((e, i) => ({
            school: e.school || '',
            degree: e.degree || '',
            field_of_study: e.field_of_study || '',
            start_date: e.start_date || '',
            end_date: e.end_date || '',
            current: e.current || false,
            description: e.description || '',
            sort_order: e.sort_order || i + 1
        })));
    }

    if (body.workExperience) {
        await saveOneToMany(ResumeWorkExperience, body.workExperience.map((w, i) => ({
            job_title: w.job_title || '',
            company: w.company || '',
            location: w.location || '',
            start_date: w.start_date || '',
            end_date: w.end_date || '',
            current: w.current || false,
            description: w.description || '',
            sort_order: w.sort_order || i + 1
        })));
    }

    if (body.skills) {
        await saveOneToMany(ResumeSkill, body.skills.map((s, i) => ({
            skill_name: s.skill_name || '',
            category: s.category || '',
            sort_order: s.sort_order || i + 1
        })));
    }

    if (body.projects) {
        await saveOneToMany(ResumeProject, body.projects.map((p, i) => ({
            name: p.name || '',
            description: p.description || '',
            url: p.url || '',
            start_date: p.start_date || '',
            end_date: p.end_date || '',
            sort_order: p.sort_order || i + 1
        })));
    }

    if (body.certifications) {
        await saveOneToMany(ResumeCertification, body.certifications.map((c, i) => ({
            name: c.name || '',
            issuer: c.issuer || '',
            date: c.date || '',
            url: c.url || '',
            sort_order: c.sort_order || i + 1
        })));
    }

    if (body.trainings) {
        await saveOneToMany(ResumeTraining, body.trainings.map((t, i) => ({
            title: t.title || '',
            provider: t.provider || '',
            start_date: t.start_date || '',
            end_date: t.end_date || '',
            description: t.description || '',
            sort_order: t.sort_order || i + 1
        })));
    }

    if (body.seminars) {
        await saveOneToMany(ResumeSeminar, body.seminars.map((s, i) => ({
            title: s.title || '',
            organizer: s.organizer || '',
            date: s.date || '',
            description: s.description || '',
            sort_order: s.sort_order || i + 1
        })));
    }

    if (body.awards) {
        await saveOneToMany(ResumeAward, body.awards.map((a, i) => ({
            title: a.title || '',
            issuer: a.issuer || '',
            date: a.date || '',
            description: a.description || '',
            sort_order: a.sort_order || i + 1
        })));
    }

    if (body.organizations) {
        await saveOneToMany(ResumeOrganization, body.organizations.map((o, i) => ({
            name: o.name || '',
            role: o.role || '',
            start_date: o.start_date || '',
            end_date: o.end_date || '',
            description: o.description || '',
            sort_order: o.sort_order || i + 1
        })));
    }

    if (body.volunteerWork) {
        await saveOneToMany(ResumeVolunteerWork, body.volunteerWork.map((v, i) => ({
            organization: v.organization || '',
            role: v.role || '',
            start_date: v.start_date || '',
            end_date: v.end_date || '',
            description: v.description || '',
            sort_order: v.sort_order || i + 1
        })));
    }

    if (body.languages) {
        await saveOneToMany(ResumeLanguage, body.languages.map((l, i) => ({
            name: l.name || '',
            proficiency: l.proficiency || '',
            sort_order: l.sort_order || i + 1
        })));
    }

    if (body.references) {
        await saveOneToMany(ResumeReference, body.references.map((r, i) => ({
            name: r.name || '',
            position: r.position || '',
            company: r.company || '',
            email: r.email || '',
            phone: r.phone || '',
            sort_order: r.sort_order || i + 1
        })));
    }
};

exports.updateResume = async (req, res) => {
    try {
        const userId = req.user?.id;
        const resumeId = req.params.id;
        const body = req.body;

        const resume = await Resume.findOne({ where: { id: resumeId, user_id: userId } });
        if (!resume) return res.status(404).json({ message: "Resume not found" });

        if (body.is_default) await ensureDefaultResume(userId, resumeId);

        // Update main resume fields
        const allowed = ['title', 'template_id', 'font_family', 'font_size', 'line_spacing', 'color_theme', 'settings', 'is_default', 'is_archived'];
        let hasMainUpdates = false;
        allowed.forEach(field => {
            if (body[field] !== undefined) {
                resume[field] = body[field];
                hasMainUpdates = true;
            }
        });

        if (hasMainUpdates) {
            await resume.save();
        }

        // Save section data (personalInfo, education, workExperience, etc.)
        await saveResumeSections(resumeId, body);

        res.json({ data: resume });
    } catch (err) {
        console.error("updateResume error:", err);
        res.status(500).json({ message: "Failed to update resume" });
    }
};

exports.deleteResume = async (req, res) => {
    try {
        const userId = req.user?.id;
        const resumeId = req.params.id;

        const resume = await Resume.findOne({ where: { id: resumeId, user_id: userId } });
        if (!resume) return res.status(404).json({ message: "Resume not found" });

        await resume.destroy();
        res.json({ message: "Resume deleted" });
    } catch (err) {
        console.error("deleteResume error:", err);
        res.status(500).json({ message: "Failed to delete resume" });
    }
};

exports.duplicateResume = async (req, res) => {
    try {
        const userId = req.user?.id;
        const resumeId = req.params.id;

        const source = await Resume.findOne({
            where: { id: resumeId, user_id: userId },
            include: [
                { model: ResumePersonalInfo, as: 'personalInfo' },
                { model: ResumeSummary, as: 'summary' },
                { model: ResumeEducation, as: 'education' },
                { model: ResumeWorkExperience, as: 'workExperience' },
                { model: ResumeSkill, as: 'skills' },
                { model: ResumeProject, as: 'projects' },
                { model: ResumeCertification, as: 'certifications' },
                { model: ResumeTraining, as: 'trainings' },
                { model: ResumeSeminar, as: 'seminars' },
                { model: ResumeAward, as: 'awards' },
                { model: ResumeOrganization, as: 'organizations' },
                { model: ResumeVolunteerWork, as: 'volunteerWork' },
                { model: ResumeLanguage, as: 'languages' },
                { model: ResumeReference, as: 'references' }
            ]
        });

        if (!source) return res.status(404).json({ message: "Resume not found" });

        await ensureDefaultResume(userId);

        const newResume = await Resume.create({
            user_id: userId,
            title: `${source.title} (Copy)`,
            template_id: source.template_id,
            font_family: source.font_family,
            font_size: source.font_size,
            line_spacing: source.line_spacing,
            color_theme: source.color_theme,
            settings: source.settings,
            is_default: true
        });

        const copySection = async (Model, data) => {
            if (!data) return;
            for (const item of data) {
                await Model.create({ ...item.toJSON ? item.toJSON() : item, resume_id: newResume.id, id: undefined });
            }
        };

        await copySection(ResumePersonalInfo, source.personalInfo);
        await copySection(ResumeSummary, source.summary);
        await copySection(ResumeEducation, source.education);
        await copySection(ResumeWorkExperience, source.workExperience);
        await copySection(ResumeSkill, source.skills);
        await copySection(ResumeProject, source.projects);
        await copySection(ResumeCertification, source.certifications);
        await copySection(ResumeTraining, source.trainings);
        await copySection(ResumeSeminar, source.seminars);
        await copySection(ResumeAward, source.awards);
        await copySection(ResumeOrganization, source.organizations);
        await copySection(ResumeVolunteerWork, source.volunteerWork);
        await copySection(ResumeLanguage, source.languages);
        await copySection(ResumeReference, source.references);

        res.status(201).json({ data: newResume });
    } catch (err) {
        console.error("duplicateResume error:", err);
        res.status(500).json({ message: "Failed to duplicate resume" });
    }
};

exports.getVersions = async (req, res) => {
    try {
        const userId = req.user?.id;
        const resumeId = req.params.id;

        const resume = await Resume.findOne({ where: { id: resumeId, user_id: userId } });
        if (!resume) return res.status(404).json({ message: "Resume not found" });

        const versions = await ResumeVersion.findAll({
            where: { resume_id: resumeId },
            order: [['version_number', 'DESC']]
        });

        res.json({ data: versions });
    } catch (err) {
        console.error("getVersions error:", err);
        res.status(500).json({ message: "Failed to fetch versions" });
    }
};

exports.getResumePdf = async (req, res) => {
    try {
        const userId = req.user?.id;
        const resumeId = req.params.id;

        const resume = await Resume.findOne({ where: { id: resumeId, user_id: userId } });
        if (!resume) return res.status(404).json({ message: "Resume not found" });

        const [personalInfo, summary, education, workExperience, skills, projects, certifications,
            trainings, seminars, awards, organizations, volunteerWork, languages, references] = await Promise.all([
                ResumePersonalInfo.findOne({ where: { resume_id: resumeId } }),
                ResumeSummary.findOne({ where: { resume_id: resumeId } }),
                ResumeEducation.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] }),
                ResumeWorkExperience.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] }),
                ResumeSkill.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] }),
                ResumeProject.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] }),
                ResumeCertification.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] }),
                ResumeTraining.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] }),
                ResumeSeminar.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] }),
                ResumeAward.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] }),
                ResumeOrganization.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] }),
                ResumeVolunteerWork.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] }),
                ResumeLanguage.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] }),
                ResumeReference.findAll({ where: { resume_id: resumeId }, order: [['sort_order', 'ASC'], ['id', 'ASC']] })
            ]);

        const data = {
            resume,
            personalInfo: personalInfo || {},
            summary: summary || {},
            education: education || [],
            workExperience: workExperience || [],
            skills: skills || [],
            projects: projects || [],
            certifications: certifications || [],
            trainings: trainings || [],
            seminars: seminars || [],
            awards: awards || [],
            organizations: organizations || [],
            volunteerWork: volunteerWork || [],
            languages: languages || [],
            references: references || []
        };

        // Return JSON data — frontend will handle PDF generation client-side
        res.json({ data });
    } catch (err) {
        console.error("getResumePdf error:", err);
        res.status(500).json({ message: "Failed to generate resume" });
    }
};

exports.createSnapshot = async (req, res) => {
    try {
        const userId = req.user?.id;
        const resumeId = req.params.id;
        const { change_summary } = req.body;

        const resume = await Resume.findOne({ where: { id: resumeId, user_id: userId } });
        if (!resume) return res.status(404).json({ message: "Resume not found" });

        // Gather full resume data for snapshot
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

        const snapshotData = {
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
            references: references.map(e => e.toJSON())
        };

        const versions = await ResumeVersion.findAll({ where: { resume_id: resumeId } });
        const nextVersion = versions.length > 0 ? Math.max(...versions.map(v => v.version_number)) + 1 : 1;

        const version = await ResumeVersion.create({
            resume_id: resumeId,
            version_number: nextVersion,
            snapshot_data: snapshotData,
            change_summary: change_summary || 'Manual save'
        });

        res.status(201).json({ data: version });
    } catch (err) {
        console.error("createSnapshot error:", err);
        res.status(500).json({ message: "Failed to create version snapshot" });
    }
};