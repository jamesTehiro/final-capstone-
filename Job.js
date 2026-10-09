module.exports = (sequelize, DataTypes) => {

    return sequelize.define("Job", {

        title: DataTypes.STRING,
        description: DataTypes.TEXT,
        location: DataTypes.STRING,
        employment_type: DataTypes.STRING,
        course_target: DataTypes.STRING,
        expected_salary: DataTypes.STRING,
        employer_id: DataTypes.INTEGER,
        current_requirement_version: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        has_requirements: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        recruitment_status: {
            type: DataTypes.STRING,
            defaultValue: "active",
            allowNull: false,
            validate: {
                isIn: [["active", "closed"]]
            }
        }

    })

}
