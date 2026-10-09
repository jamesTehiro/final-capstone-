module.exports = (sequelize, DataTypes) => {
    return sequelize.define(
        "EmailQueueJob",
        {
            to: {
                type: DataTypes.STRING,
                allowNull: false
            },
            subject: {
                type: DataTypes.STRING,
                allowNull: false
            },
            message: {
                type: DataTypes.TEXT("long"),
                allowNull: false
            },
            status: {
                type: DataTypes.ENUM("pending", "processing", "sent", "failed"),
                allowNull: false,
                defaultValue: "pending"
            },
            attempts: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            max_attempts: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 5
            },
            last_error: {
                type: DataTypes.TEXT("long"),
                allowNull: true
            },
            scheduled_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            },
            processing_started_at: {
                type: DataTypes.DATE,
                allowNull: true
            },
            sent_at: {
                type: DataTypes.DATE,
                allowNull: true
            }
        },
        {
            tableName: "email_queue_jobs",
            indexes: [
                { fields: ["status", "scheduled_at"] },
                { fields: ["status", "processing_started_at"] }
            ]
        }
    );
};
