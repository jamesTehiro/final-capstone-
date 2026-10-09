module.exports = (sequelize, DataTypes) => {
    return sequelize.define("RequirementGroup", {
        job_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        version: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        },
        group_label: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        sort_order: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        }
    }, {
        tableName: "RequirementGroups",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: false
    });
};