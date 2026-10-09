module.exports = (sequelize, DataTypes) => {
    return sequelize.define("ResumeWorkExperience", {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        resume_id: { type: DataTypes.INTEGER, allowNull: false },
        job_title: DataTypes.STRING(255),
        company: DataTypes.STRING(255),
        location: DataTypes.STRING(255),
        start_date: DataTypes.DATE,
        end_date: DataTypes.DATE,
        is_current: { type: DataTypes.BOOLEAN, defaultValue: false },
        description: DataTypes.TEXT,
        sort_order: { type: DataTypes.INTEGER, defaultValue: 0 }
    }, {
        tableName: "resumeworkexperiences",
        timestamps: true
    });
};