module.exports = (sequelize, DataTypes) => {
    return sequelize.define("ApplicationResponse", {
        application_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        requirement_code: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        response_value: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        review_status: {
            type: DataTypes.ENUM("pending_review", "approved", "rejected", "needs_revision"),
            defaultValue: "pending_review"
        },
        review_notes: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        reviewed_by: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        reviewed_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        version: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        }
    }, {
        tableName: "ApplicationResponses",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at"
    });
};