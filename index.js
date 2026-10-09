const Sequelize = require("sequelize");
const sequelize = require("../config/database");

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

// IMPORT MODELS

db.User = require("./User")(sequelize, Sequelize);
db.AlumniProfile = require("./AlumniProfile")(sequelize, Sequelize);
db.EmployerProfile = require("./EmployerProfile")(sequelize, Sequelize);
db.EmploymentHistory = require("./EmploymentHistory")(sequelize, Sequelize);
db.Job = require("./Job")(sequelize, Sequelize);
db.Application = require("./Application")(sequelize, Sequelize);
db.Announcement = require("./Announcement")(sequelize, Sequelize);
db.Comment = require("./Comment")(sequelize, Sequelize);
db.Conversation = require("./Conversation")(sequelize, Sequelize);
db.ConversationParticipant = require("./ConversationParticipant")(sequelize, Sequelize);
db.Message = require("./Message")(sequelize, Sequelize);
db.Notification = require("./Notification")(sequelize, Sequelize);
db.Interview = require("./Interview")(sequelize, Sequelize);
db.AlumniRecord = require("./AlumniRecord")(sequelize, Sequelize);
db.Post = require("./Post")(sequelize, Sequelize);
db.EmployerConversation = require("./EmployerConversation")(sequelize, Sequelize);
db.EmployerMessage = require("./EmployerMessage")(sequelize, Sequelize);
db.PasswordResetToken = require("./PasswordResetToken")(sequelize, Sequelize);
db.EmailQueueJob = require("./EmailQueueJob")(sequelize, Sequelize);
db.RateLimitEntry = require("./RateLimitEntry")(sequelize, Sequelize);
db.RequirementLibrary = require("./RequirementLibrary")(sequelize, Sequelize);
db.RequirementGroup = require("./RequirementGroup")(sequelize, Sequelize);
db.JobRequirement = require("./JobRequirement")(sequelize, Sequelize);
db.JobRequirementSnapshot = require("./JobRequirementSnapshot")(sequelize, Sequelize);
db.ApplicationDocument = require("./ApplicationDocument")(sequelize, Sequelize);
db.ApplicationResponse = require("./ApplicationResponse")(sequelize, Sequelize);
db.AuditLog = require("./AuditLog")(sequelize, Sequelize);

// Resume models
db.Resume = require("./Resume")(sequelize, Sequelize);
db.ResumePersonalInfo = require("./ResumePersonalInfo")(sequelize, Sequelize);
db.ResumeSummary = require("./ResumeSummary")(sequelize, Sequelize);
db.ResumeEducation = require("./ResumeEducation")(sequelize, Sequelize);
db.ResumeWorkExperience = require("./ResumeWorkExperience")(sequelize, Sequelize);
db.ResumeSkill = require("./ResumeSkills")(sequelize, Sequelize);
db.ResumeProject = require("./ResumeProjects")(sequelize, Sequelize);
db.ResumeCertification = require("./ResumeCertifications")(sequelize, Sequelize);
db.ResumeTraining = require("./ResumeTrainings")(sequelize, Sequelize);
db.ResumeSeminar = require("./ResumeSeminars")(sequelize, Sequelize);
db.ResumeAward = require("./ResumeAwards")(sequelize, Sequelize);
db.ResumeOrganization = require("./ResumeOrganizations")(sequelize, Sequelize);
db.ResumeVolunteerWork = require("./ResumeVolunteerWork")(sequelize, Sequelize);
db.ResumeLanguage = require("./ResumeLanguages")(sequelize, Sequelize);
db.ResumeReference = require("./ResumeReferences")(sequelize, Sequelize);
db.ResumeVersion = require("./ResumeVersion")(sequelize, Sequelize);

// Alias exports for consistency
db.ResumeSkills = db.ResumeSkill;
db.ResumeProjects = db.ResumeProject;
db.ResumeCertifications = db.ResumeCertification;
db.ResumeTrainings = db.ResumeTraining;
db.ResumeSeminars = db.ResumeSeminar;
db.ResumeAwards = db.ResumeAward;
db.ResumeOrganizations = db.ResumeOrganization;
db.ResumeVolunteerWork = db.ResumeVolunteerWork;
db.ResumeLanguages = db.ResumeLanguage;
db.ResumeReferences = db.ResumeReference;

// RELATIONSHIPS

db.User.hasOne(db.AlumniProfile, { foreignKey: "user_id" });
db.User.hasOne(db.EmployerProfile, { foreignKey: "user_id" });
db.User.belongsTo(db.AlumniRecord, { foreignKey: "alumni_record_id", as: "AlumniRecord" });
db.AlumniRecord.hasOne(db.User, { foreignKey: "alumni_record_id" });
db.User.hasMany(db.Message, { foreignKey: "sender_id", as: "sentMessages" });
db.Message.belongsTo(db.User, { foreignKey: "sender_id", as: "sender" });
db.Conversation.hasMany(db.Message, { foreignKey: "conversation_id" });
db.Message.belongsTo(db.Conversation, { foreignKey: "conversation_id" });
db.User.belongsToMany(db.Conversation, {
    through: db.ConversationParticipant,
    foreignKey: "user_id",
    otherKey: "conversation_id",
    as: "conversations"
});
db.Conversation.belongsToMany(db.User, {
    through: db.ConversationParticipant,
    foreignKey: "conversation_id",
    otherKey: "user_id",
    as: "participants"
});
db.Conversation.hasMany(db.ConversationParticipant, { foreignKey: "conversation_id" });
db.ConversationParticipant.belongsTo(db.Conversation, { foreignKey: "conversation_id" });
db.User.hasMany(db.ConversationParticipant, { foreignKey: "user_id" });
db.ConversationParticipant.belongsTo(db.User, { foreignKey: "user_id" });

db.AlumniProfile.hasMany(db.EmploymentHistory, { foreignKey: "alumni_id" });
db.EmploymentHistory.belongsTo(db.AlumniProfile, { foreignKey: "alumni_id" });

db.User.hasMany(db.Job, { foreignKey: "employer_id" });
db.Job.belongsTo(db.User, { foreignKey: "employer_id" });

db.Job.hasMany(db.Application, { foreignKey: "job_id" });
db.Application.belongsTo(db.Job, { foreignKey: "job_id" });

db.User.hasMany(db.Application, { foreignKey: "alumni_id" });
db.Application.belongsTo(db.User, { foreignKey: "alumni_id", as: "alumni" });
db.Application.hasMany(db.Interview, { foreignKey: "application_id" });
db.Interview.belongsTo(db.Application, { foreignKey: "application_id" });
db.Interview.hasMany(db.Notification, { foreignKey: "interview_id" });
db.Notification.belongsTo(db.Interview, { foreignKey: "interview_id" });
db.User.hasMany(db.Post, { foreignKey: "user_id" });
db.Post.belongsTo(db.User, { foreignKey: "user_id" });
db.User.hasOne(db.EmployerConversation, { foreignKey: "employerId", as: "employerConversation" });
db.EmployerConversation.belongsTo(db.User, { foreignKey: "employerId", as: "employer" });
db.User.hasMany(db.EmployerConversation, { foreignKey: "adminId", as: "adminEmployerConversations" });
db.EmployerConversation.belongsTo(db.User, { foreignKey: "adminId", as: "admin" });
db.EmployerConversation.hasMany(db.EmployerMessage, { foreignKey: "conversationId", as: "messages" });
db.EmployerMessage.belongsTo(db.EmployerConversation, { foreignKey: "conversationId", as: "conversation" });
db.User.hasMany(db.PasswordResetToken, { foreignKey: "user_id" });
db.PasswordResetToken.belongsTo(db.User, { foreignKey: "user_id" });

db.User.hasMany(db.Announcement, { foreignKey: "admin_id" });
db.Announcement.belongsTo(db.User, { foreignKey: "admin_id", as: "admin" });
db.Announcement.hasMany(db.Comment, { foreignKey: "announcement_id" });

db.Post.hasMany(db.Comment, { foreignKey: "post_id" });
db.Comment.belongsTo(db.Post, { foreignKey: "post_id" });
db.User.hasMany(db.Comment, { foreignKey: "user_id" });
db.Comment.belongsTo(db.User, { foreignKey: "user_id" });

db.Job.hasMany(db.RequirementGroup, { foreignKey: "job_id" });
db.RequirementGroup.belongsTo(db.Job, { foreignKey: "job_id" });
db.Job.hasMany(db.JobRequirement, { foreignKey: "job_id" });
db.JobRequirement.belongsTo(db.Job, { foreignKey: "job_id" });
db.RequirementGroup.hasMany(db.JobRequirement, { foreignKey: "group_id" });
db.JobRequirement.belongsTo(db.RequirementGroup, { foreignKey: "group_id" });
db.RequirementLibrary.hasMany(db.JobRequirement, { foreignKey: "library_id" });
db.JobRequirement.belongsTo(db.RequirementLibrary, { foreignKey: "library_id" });
db.Application.hasOne(db.JobRequirementSnapshot, { foreignKey: "application_id" });
db.JobRequirementSnapshot.belongsTo(db.Application, { foreignKey: "application_id" });
db.JobRequirementSnapshot.belongsTo(db.Job, { foreignKey: "job_id" });
db.Application.hasMany(db.ApplicationDocument, { foreignKey: "application_id" });
db.ApplicationDocument.belongsTo(db.Application, { foreignKey: "application_id" });
db.Application.hasMany(db.ApplicationResponse, { foreignKey: "application_id" });
db.ApplicationResponse.belongsTo(db.Application, { foreignKey: "application_id" });
db.ApplicationDocument.belongsTo(db.ApplicationDocument, { foreignKey: "original_document_id", as: "originalDocument" });
db.ApplicationDocument.hasMany(db.ApplicationDocument, { foreignKey: "original_document_id", as: "revisions" });
db.User.hasMany(db.AuditLog, { foreignKey: "actor_id" });
db.AuditLog.belongsTo(db.User, { foreignKey: "actor_id" });
db.User.hasMany(db.ApplicationDocument, { foreignKey: "reviewed_by", as: "documentReviews" });
db.ApplicationDocument.belongsTo(db.User, { foreignKey: "reviewed_by", as: "reviewer" });
db.User.hasMany(db.ApplicationResponse, { foreignKey: "reviewed_by", as: "responseReviews" });
db.ApplicationResponse.belongsTo(db.User, { foreignKey: "reviewed_by", as: "responseReviewer" });

// Resume relationships
db.User.hasMany(db.Resume, { foreignKey: "user_id" });
db.Resume.belongsTo(db.User, { foreignKey: "user_id" });

db.Resume.hasOne(db.ResumePersonalInfo, { foreignKey: "resume_id", as: "personalInfo" });
db.ResumePersonalInfo.belongsTo(db.Resume, { foreignKey: "resume_id" });

db.Resume.hasOne(db.ResumeSummary, { foreignKey: "resume_id", as: "summary" });
db.ResumeSummary.belongsTo(db.Resume, { foreignKey: "resume_id" });

db.Resume.hasMany(db.ResumeEducation, { foreignKey: "resume_id", as: "education" });
db.ResumeEducation.belongsTo(db.Resume, { foreignKey: "resume_id" });

db.Resume.hasMany(db.ResumeWorkExperience, { foreignKey: "resume_id", as: "workExperience" });
db.ResumeWorkExperience.belongsTo(db.Resume, { foreignKey: "resume_id" });

db.Resume.hasMany(db.ResumeSkill, { foreignKey: "resume_id", as: "skills" });
db.ResumeSkill.belongsTo(db.Resume, { foreignKey: "resume_id" });

db.Resume.hasMany(db.ResumeProject, { foreignKey: "resume_id", as: "projects" });
db.ResumeProject.belongsTo(db.Resume, { foreignKey: "resume_id" });

db.Resume.hasMany(db.ResumeCertification, { foreignKey: "resume_id", as: "certifications" });
db.ResumeCertification.belongsTo(db.Resume, { foreignKey: "resume_id" });

db.Resume.hasMany(db.ResumeTraining, { foreignKey: "resume_id", as: "trainings" });
db.ResumeTraining.belongsTo(db.Resume, { foreignKey: "resume_id" });

db.Resume.hasMany(db.ResumeSeminar, { foreignKey: "resume_id", as: "seminars" });
db.ResumeSeminar.belongsTo(db.Resume, { foreignKey: "resume_id" });

db.Resume.hasMany(db.ResumeAward, { foreignKey: "resume_id", as: "awards" });
db.ResumeAward.belongsTo(db.Resume, { foreignKey: "resume_id" });

db.Resume.hasMany(db.ResumeOrganization, { foreignKey: "resume_id", as: "organizations" });
db.ResumeOrganization.belongsTo(db.Resume, { foreignKey: "resume_id" });

db.Resume.hasMany(db.ResumeVolunteerWork, { foreignKey: "resume_id", as: "volunteerWork" });
db.ResumeVolunteerWork.belongsTo(db.Resume, { foreignKey: "resume_id" });

db.Resume.hasMany(db.ResumeLanguage, { foreignKey: "resume_id", as: "languages" });
db.ResumeLanguage.belongsTo(db.Resume, { foreignKey: "resume_id" });

db.Resume.hasMany(db.ResumeReference, { foreignKey: "resume_id", as: "references" });
db.ResumeReference.belongsTo(db.Resume, { foreignKey: "resume_id" });

db.Resume.hasMany(db.ResumeVersion, { foreignKey: "resume_id", as: "versions" });
db.ResumeVersion.belongsTo(db.Resume, { foreignKey: "resume_id" });

module.exports = db;