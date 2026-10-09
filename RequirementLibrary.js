module.exports = (sequelize, DataTypes) => {
    return sequelize.define("RequirementLibrary", {
        requirement_code: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true
        },
        category: {
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
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        sort_order: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        }
    }, {
        tableName: "RequirementLibrary",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at"
    });
};