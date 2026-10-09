module.exports = (sequelize, DataTypes) => {
    return sequelize.define("ResumeEducation", {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        resume_id: { type: DataTypes.INTEGER, allowNull: false },
        institution: DataTypes.STRING(255),
        degree: DataTypes.STRING(255),
        field_of_study: DataTypes.STRING(255),
        start_date: DataTypes.DATE,
        end_date: DataTypes.DATE,
        is_current: { type: DataTypes.BOOLEAN, defaultValue: false },
        gpa: DataTypes.STRING(20),
        description: DataTypes.TEXT,
        sort_order: { type: DataTypes.INTEGER, defaultValue: 0 }
    }, {
        tableName: "resumeeducations",
        timestamps: true
    });
};