module.exports = (sequelize, DataTypes) => {
    return sequelize.define("Interview", {
        application_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        venue: {
            type: DataTypes.STRING,
            allowNull: false
        },
        place: {
            type: DataTypes.STRING,
            allowNull: false
        },
        date: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        time: {
            type: DataTypes.STRING,
            allowNull: false
        },
        contact_info: {
            type: DataTypes.STRING,
            allowNull: false
        },
        what_to_bring: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    });
};
