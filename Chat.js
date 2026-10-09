module.exports = (sequelize, DataTypes) => {

    return sequelize.define("Conversation", {

        user1_id: DataTypes.INTEGER,
        user2_id: DataTypes.INTEGER

    })

}

module.exports = (sequelize, DataTypes) => {

    return sequelize.define("Message", {

        conversation_id: DataTypes.INTEGER,
        sender_id: DataTypes.INTEGER,
        message: DataTypes.TEXT

    })

}