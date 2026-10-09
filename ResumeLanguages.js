module.exports = (sequelize, DataTypes) => {
    return sequelize.define("ResumeLanguage", {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        resume_id: { type: DataTypes.INTEGER, allowNull: false },
        language: DataTypes.STRING(100),
        proficiency: DataTypes.STRING(100),
        sort_order: { type: DataTypes.INTEGER, defaultValue: 0 }
    }, {
        tableName: "resumelanguages",
        timestamps: true,
       
    });
};