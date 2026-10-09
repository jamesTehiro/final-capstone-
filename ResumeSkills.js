module.exports = (sequelize, DataTypes) => {
    return sequelize.define("ResumeSkill", {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        resume_id: { type: DataTypes.INTEGER, allowNull: false },
        category: DataTypes.STRING(100),
        skill_name: { type: DataTypes.STRING(255), allowNull: false },
        sort_order: { type: DataTypes.INTEGER, defaultValue: 0 }
    }, {
        tableName: "resumeskills",
        timestamps: true,

    });
};