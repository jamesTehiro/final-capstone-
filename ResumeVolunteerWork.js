module.exports = (sequelize, DataTypes) => {
    return sequelize.define("ResumeVolunteerWork", {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        resume_id: { type: DataTypes.INTEGER, allowNull: false },
        organization: DataTypes.STRING(255),
        role: DataTypes.STRING(255),
        start_date: DataTypes.DATE,
        end_date: DataTypes.DATE,
        is_current: { type: DataTypes.BOOLEAN, defaultValue: false },
        description: DataTypes.TEXT,
        sort_order: { type: DataTypes.INTEGER, defaultValue: 0 }
    }, {
        tableName: "resumevolunteerworks",
        timestamps: true,

    });
};