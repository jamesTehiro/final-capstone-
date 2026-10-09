module.exports = (sequelize, DataTypes) => {
    return sequelize.define("ResumePersonalInfo", {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        resume_id: { type: DataTypes.INTEGER, allowNull: false },
        full_name: DataTypes.STRING(255),
        professional_title: DataTypes.STRING(255),
        email: DataTypes.STRING(255),
        phone: DataTypes.STRING(50),
        address: DataTypes.TEXT,
        linkedin: DataTypes.STRING(500),
        github: DataTypes.STRING(500),
        portfolio: DataTypes.STRING(500),
        website: DataTypes.STRING(500),
        photo_url: DataTypes.TEXT
    }, {
        tableName: "resumepersonalinfo",
        timestamps: true
    });
};