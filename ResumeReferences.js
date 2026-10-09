module.exports = (sequelize, DataTypes) => {
    return sequelize.define("ResumeReference", {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        resume_id: { type: DataTypes.INTEGER, allowNull: false },
        name: DataTypes.STRING(255),
        relationship: DataTypes.STRING(255),
        company: DataTypes.STRING(255),
        email: DataTypes.STRING(255),
        phone: DataTypes.STRING(50),
        sort_order: { type: DataTypes.INTEGER, defaultValue: 0 }
    }, {
        tableName: "resumereferences",
        timestamps: true,

    });
};