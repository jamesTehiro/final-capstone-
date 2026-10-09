module.exports = (sequelize, DataTypes) => {
    return sequelize.define("EmployerConversation", {
        employerId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true
        },
        adminId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        last_message_text: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        last_message_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    });
};
