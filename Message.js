module.exports = (sequelize, Sequelize) => {
    const Message = sequelize.define(
        "Message",
        {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            conversation_id: {
                type: Sequelize.INTEGER,
                allowNull: false
            },
            sender_id: {
                type: Sequelize.INTEGER,
                allowNull: false
            },
            message_text: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            file_url: {
                type: Sequelize.STRING,
                allowNull: true
            },
            file_name: {
                type: Sequelize.STRING,
                allowNull: true
            },
            file_mime: {
                type: Sequelize.STRING,
                allowNull: true
            },
            is_read: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
            }
        },
        {
            indexes: [
                { fields: ["conversation_id", "createdAt"] },
                { fields: ["sender_id"] },
                { fields: ["is_read"] }
            ]
        }
    );

    return Message;
};