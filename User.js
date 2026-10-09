module.exports = (sequelize, DataTypes) => {
    return sequelize.define(
        "User",
        {
            name: DataTypes.STRING,
            email: { type: DataTypes.STRING, unique: true },
            password: DataTypes.STRING,
            role: DataTypes.STRING,
            admin_scope: DataTypes.STRING,
            admin_department: DataTypes.STRING,
            admin_avatar_url: DataTypes.TEXT("long"),
            account_status: {
                type: DataTypes.STRING,
                defaultValue: "pending"
            },
            alumni_record_id: {
                type: DataTypes.INTEGER,
                allowNull: true
            }
        },
        {
            indexes: [
                { unique: true, fields: ["email"] },
                { unique: true, fields: ["role", "admin_scope"] }
            ]
        }
    );
};
