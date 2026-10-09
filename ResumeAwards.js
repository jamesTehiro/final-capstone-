module.exports = (sequelize, DataTypes) => {
    return sequelize.define("ResumeAward", {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        resume_id: { type: DataTypes.INTEGER, allowNull: false },
        title: DataTypes.STRING(255),
        issuer: DataTypes.STRING(255),
        date: DataTypes.DATE,
        description: DataTypes.TEXT,
        sort_order: { type: DataTypes.INTEGER, defaultValue: 0 }
    }, {
        tableName: "resumeawards",
        timestamps: true,
    });
};