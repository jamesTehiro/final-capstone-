module.exports = (sequelize, DataTypes) => {
    return sequelize.define("AuditLog", {
        actor_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        actor_role: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        action: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        target_type: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        target_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        requirement_code: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        metadata: {
            type: DataTypes.JSON,
            allowNull: true
        },
        ip_address: {
            type: DataTypes.STRING(45),
            allowNull: true
        }
    }, {
        tableName: "AuditLogs",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: false
    });
};