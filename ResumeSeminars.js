module.exports = (sequelize, DataTypes) => {
    return sequelize.define("ResumeSeminar", {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        resume_id: { type: DataTypes.INTEGER, allowNull: false },
        seminar_name: DataTypes.STRING(255),
        organizer: DataTypes.STRING(255),
        date: DataTypes.DATE,
        location: DataTypes.STRING(255),
        description: DataTypes.TEXT,
        sort_order: { type: DataTypes.INTEGER, defaultValue: 0 }
    }, {
        tableName: "resumeseminars",
        timestamps: true,
       
    });
};