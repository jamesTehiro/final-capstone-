const db = require("../models");

// GET /api/profile/:userId/preview
// Returns a privacy-safe profile preview for the feed modal.
//
// - Public profiles: full data (name, avatar, address, graduation_year, course,
//   employment_status, current_company, job_title, employment_history)
// - Private profiles: only name, avatar, visibility, and a private flag.
// - Admins viewing themselves: full data.
// - Employer access: only if alumni applied to their job.
exports.getProfilePreview = async (req, res) => {
    try {
        // eslint-disable-next-line no-console
        console.log("Profile Preview Controller Hit", {
            userId: req.params.userId,
            viewerId: req.user?.id,
            method: req.method,
            path: req.path
        });
        const targetUserId = Number(req.params.userId);
        if (!targetUserId) {
            return res.status(400).json({ msg: "Invalid user id." });
        }

        const viewer = await db.User.findByPk(req.user.id);
        if (!viewer) {
            return res.status(401).json({ msg: "Unauthorized" });
        }

        const target = await db.User.findByPk(targetUserId, {
            include: [
                {
                    model: db.AlumniProfile,
                    include: [{ model: db.EmploymentHistory }]
                },
                { model: db.EmployerProfile }
            ],
            attributes: { exclude: ["password"] }
        });

        if (!target) {
            return res.status(404).json({ msg: "User not found" });
        }

        const isSelf = viewer.id === target.id;
        const isAdmin = viewer.role === "admin";

        // Employer access check
        if (!isSelf && !isAdmin && viewer.role === "employer" && target.role === "alumni") {
            const application = await db.Application.findOne({
                where: { alumni_id: target.id },
                include: [
                    {
                        model: db.Job,
                        where: { employer_id: viewer.id }
                    }
                ]
            });
            if (!application) {
                return res.status(403).json({
                    msg: "You can view this alumni profile only after they apply to one of your jobs."
                });
            }
        }

        const targetVisibility = target.AlumniProfile?.profile_visibility || "public";

        // Private profile: only return allowed fields
        if (!isSelf && !isAdmin && target.role === "alumni" && targetVisibility !== "public") {
            return res.json({
                id: target.id,
                name: target.name,
                role: target.role,
                visibility: "private",
                isPrivate: true,
                AlumniProfile: target.AlumniProfile
                    ? {
                        avatar_url: target.AlumniProfile.avatar_url,
                        profile_visibility: target.AlumniProfile.profile_visibility || "private"
                    }
                    : null,
                EmployerProfile: target.EmployerProfile
                    ? {
                        logo_url: target.EmployerProfile.logo_url,
                        organization_name: target.EmployerProfile.organization_name
                    }
                    : null
            });
        }

        // Public profile or self/admin: return full data with employment history
        const profileData = {
            id: target.id,
            name: target.name,
            role: target.role,
            admin_scope: target.admin_scope,
            admin_department: target.admin_department,
            admin_avatar_url: target.admin_avatar_url,
            visibility: targetVisibility,
            isPrivate: false,
            AlumniProfile: target.AlumniProfile
                ? {
                    avatar_url: target.AlumniProfile.avatar_url,
                    course: target.AlumniProfile.course,
                    graduation_year: target.AlumniProfile.graduation_year,
                    address: target.AlumniProfile.address,
                    profile_visibility: target.AlumniProfile.profile_visibility || "public",
                    employment_status: target.AlumniProfile.employment_status,
                    current_company: target.AlumniProfile.current_company,
                    job_title: target.AlumniProfile.job_title,
                    EmploymentHistories: target.AlumniProfile.EmploymentHistories
                        ? target.AlumniProfile.EmploymentHistories.map((eh) => ({
                            id: eh.id,
                            company_name: eh.company_name,
                            position: eh.position,
                            start_year: eh.start_year,
                            end_year: eh.end_year,
                            employment_type: eh.employment_type
                        }))
                        : []
                }
                : null,
            EmployerProfile: target.EmployerProfile
                ? {
                    logo_url: target.EmployerProfile.logo_url,
                    organization_name: target.EmployerProfile.organization_name,
                    industry: target.EmployerProfile.industry,
                    address: target.EmployerProfile.address
                }
                : null
        };

        return res.json(profileData);
    } catch (err) {
        return res.status(500).json({ msg: err.message });
    }
};
