module.exports = (sequelize, Sequelize) => {
    const Notification = sequelize.define("Notification", {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        userId: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        type: {
            type: Sequelize.STRING
        },
        interview_id: {
            type: Sequelize.INTEGER,
            allowNull: true
        },
        message: {
            type: Sequelize.STRING
        },
        isRead: {
            type: Sequelize.BOOLEAN,
            defaultValue: false
        }
    });

    return Notification;
};
