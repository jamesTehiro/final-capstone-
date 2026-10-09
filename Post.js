module.exports = (sequelize, DataTypes) => {
    return sequelize.define(
        "Post",
        {
            user_id: DataTypes.INTEGER,
            text: DataTypes.TEXT,
            image_url: DataTypes.TEXT
        },
        {
            indexes: [
                { fields: ["createdAt"], name: "posts_created_at_idx" }
            ]
        }
    );
};
