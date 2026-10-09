module.exports = (sequelize, DataTypes) => {

    return sequelize.define("EmployerProfile", {

        user_id: DataTypes.INTEGER,
        organization_name: DataTypes.STRING,
        industry: DataTypes.STRING,
        website_url: DataTypes.STRING,
        business_permit_path: DataTypes.STRING,
        address: DataTypes.STRING,
        contact_email: DataTypes.STRING,
        logo_url: DataTypes.TEXT("long"),
        verified: DataTypes.BOOLEAN

    })

}
