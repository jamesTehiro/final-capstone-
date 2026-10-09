module.exports = (sequelize, DataTypes) => {
    return sequelize.define("ResumeCertification", {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        resume_id: { type: DataTypes.INTEGER, allowNull: false },
        name: DataTypes.STRING(255),
        issuer: DataTypes.STRING(255),
        issue_date: DataTypes.DATE,
        expiry_date: DataTypes.DATE,
        credential_id: DataTypes.STRING(255),
        url: DataTypes.STRING(500),
        sort_order: { type: DataTypes.INTEGER, defaultValue: 0 }
    }, {
        tableName: "resumecertifications",
        timestamps: true,
    });
};