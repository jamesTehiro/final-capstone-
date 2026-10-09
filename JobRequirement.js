module.exports = (sequelize, DataTypes) => {
    return sequelize.define("JobRequirement", {
        job_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        version: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        },
        group_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        library_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        requirement_code: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        label: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        requirement_type: {
            type: DataTypes.ENUM("document_upload", "information_field"),
            allowNull: false,
            defaultValue: "document_upload"
        },
        value_type: {
            type: DataTypes.STRING(50),
            allowNull: true
        },
        value_options: {
            type: DataTypes.JSON,
            allowNull: true
        },
        required: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        is_custom: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        condition_enabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        condition_field: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        condition_operator: {
            type: DataTypes.STRING(20),
            allowNull: true
        },
        condition_value: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        allowed_types: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        max_file_size: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        sort_order: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        }
    }, {
        tableName: "JobRequirements",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: false
    });
};