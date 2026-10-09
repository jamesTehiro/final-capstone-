module.exports = (sequelize, DataTypes) => {

    return sequelize.define("EmploymentHistory", {

        alumni_id: DataTypes.INTEGER,
        company_name: DataTypes.STRING,
        position: DataTypes.STRING,
        start_year: DataTypes.INTEGER,
        end_year: DataTypes.INTEGER,
        employment_type: DataTypes.STRING

    })

}