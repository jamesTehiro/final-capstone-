module.exports = (sequelize, DataTypes) => {
    return sequelize.define("ResumeTraining", {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        resume_id: { type: DataTypes.INTEGER, allowNull: false },
        training_name: DataTypes.STRING(255),
        provider: DataTypes.STRING(255),
        completion_date: DataTypes.DATE,
        description: DataTypes.TEXT,
        sort_order: { type: DataTypes.INTEGER, defaultValue: 0 }
    }, {
        tableName: "resumetrainings",
        timestamps: true,

    });
};