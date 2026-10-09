module.exports = (sequelize, DataTypes) => {
    return sequelize.define(
        "PasswordResetToken",
        {
            user_id: DataTypes.INTEGER,
            role: DataTypes.STRING,
            token: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true
            },
            expires_at: DataTypes.DATE
        },
        {
            tableName: "password_reset_tokens",
            timestamps: false
        }
    );
};
