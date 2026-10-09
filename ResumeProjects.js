module.exports = (sequelize, DataTypes) => {
    return sequelize.define("ResumeProject", {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        resume_id: { type: DataTypes.INTEGER, allowNull: false },
        project_name: DataTypes.STRING(255),
        description: DataTypes.TEXT,
        technologies: DataTypes.TEXT,
        url: DataTypes.STRING(500),
        start_date: DataTypes.DATE,
        end_date: DataTypes.DATE,
        is_current: { type: DataTypes.BOOLEAN, defaultValue: false },
        sort_order: { type: DataTypes.INTEGER, defaultValue: 0 }
    }, {
        tableName: "resumeprojects",
        timestamps: true,

    });
};