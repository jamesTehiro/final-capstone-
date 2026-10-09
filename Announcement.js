module.exports = (sequelize, DataTypes) => {

    return sequelize.define("Announcement", {

        title: DataTypes.STRING,
        content: DataTypes.TEXT,
        admin_id: DataTypes.INTEGER,
        day: DataTypes.DATEONLY,
        time: DataTypes.STRING,
        location: DataTypes.STRING

    })

}
