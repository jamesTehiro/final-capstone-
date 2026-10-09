module.exports = (sequelize, DataTypes) => {
    return sequelize.define("ResumeSummary", {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        resume_id: { type: DataTypes.INTEGER, allowNull: false },
        content: DataTypes.TEXT
    }, {
        tableName: "resumesummaries",
        timestamps: true
    });
};