module.exports = (sequelize, DataTypes) => {
    return sequelize.define("ResumeVersion", {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        resume_id: { type: DataTypes.INTEGER, allowNull: false },
        version_number: { type: DataTypes.INTEGER, allowNull: false },
        snapshot_data: DataTypes.JSON,
        change_summary: DataTypes.TEXT
    }, {
        tableName: "resumeversions",
        timestamps: true,

    });
};