module.exports = (sequelize, DataTypes) => {

    return sequelize.define("AlumniProfile", {

        user_id: DataTypes.INTEGER,
        course: DataTypes.STRING,
        graduation_year: DataTypes.INTEGER,
        phone: DataTypes.STRING,
        address: DataTypes.STRING,
        profile_visibility: DataTypes.STRING,
        avatar_url: DataTypes.TEXT,
        proof_document_path: DataTypes.TEXT,
        employment_status: DataTypes.STRING(30),
        current_company: DataTypes.STRING,
        job_title: DataTypes.STRING

    })
}

