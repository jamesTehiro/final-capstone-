module.exports = (sequelize, DataTypes) => {
    return sequelize.define(
        "ConversationParticipant",
        {
            conversation_id: {
                type: DataTypes.INTEGER,
                allowNull: false
            },
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: false
            },
            unread_count: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            last_read_at: {
                type: DataTypes.DATE,
                allowNull: true
            }
        },
        {
            indexes: [
                { unique: true, fields: ["conversation_id", "user_id"] },
                { fields: ["user_id"] },
                { fields: ["conversation_id"] }
            ]
        }
    );
};
