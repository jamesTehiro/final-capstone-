module.exports = (sequelize, Sequelize) => {
    const Conversation = sequelize.define(
        "Conversation",
        {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            user1Id: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            user2Id: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            conversation_key: {
                type: Sequelize.STRING,
                allowNull: true,
                unique: true
            },
            name: {
                type: Sequelize.STRING,
                allowNull: true
            },
            type: {
                type: Sequelize.STRING,
                allowNull: true
            },
            batch_year: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            course: {
                type: Sequelize.STRING,
                allowNull: true
            },
            last_message_text: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            last_message_at: {
                type: Sequelize.DATE,
                allowNull: true
            }
        },
        {
            indexes: [
                { unique: true, fields: ["conversation_key"] },
                { fields: ["type"] },
                { fields: ["batch_year", "course"] }
            ]
        }
    );

    return Conversation;
};
