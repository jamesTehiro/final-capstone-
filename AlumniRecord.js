module.exports = (sequelize, DataTypes) => {
    return sequelize.define("AlumniRecord", {
        full_name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        student_id: {
            type: DataTypes.STRING,
            unique: true
        },
        course: {
            type: DataTypes.STRING,
            allowNull: false
        },
        batch_year: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        email: {
            type: DataTypes.STRING,
            unique: true
        }
    });
};
