module.exports = (sequelize, DataTypes) => {
    return sequelize.define(
        "EmployerMessage",
        {
            conversationId: {
                type: DataTypes.INTEGER,
                allowNull: false
            },
            senderType: {
                type: DataTypes.ENUM("employer", "admin"),
                allowNull: false
            },
            senderId: {
                type: DataTypes.INTEGER,
                allowNull: false
            },
            message: {
                type: DataTypes.TEXT,
                allowNull: true
            },
            attachment: {
                type: DataTypes.STRING,
                allowNull: true
            }
        },
        {
            indexes: [
                { fields: ["conversationId", "createdAt"] },
                { fields: ["senderId"] }
            ]
        }
    );
};
