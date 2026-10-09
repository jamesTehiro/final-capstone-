module.exports = (sequelize, DataTypes) => {
    return sequelize.define(
        "RateLimitEntry",
        {
            scope: {
                type: DataTypes.STRING,
                allowNull: false
            },
            key: {
                type: DataTypes.STRING,
                allowNull: false
            },
            window_start: {
                type: DataTypes.DATE,
                allowNull: false
            },
            count: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            expires_at: {
                type: DataTypes.DATE,
                allowNull: false
            }
        },
        {
            tableName: "rate_limit_entries",
            updatedAt: false,
            indexes: [
                { unique: true, fields: ["scope", "key", "window_start"] },
                { fields: ["expires_at"] }
            ]
        }
    );
};
