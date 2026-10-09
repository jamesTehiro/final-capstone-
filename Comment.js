module.exports = (sequelize, DataTypes) => {
    return sequelize.define(
        "Comment",
        {
            announcement_id: DataTypes.INTEGER,
            post_id: DataTypes.INTEGER,
            user_id: DataTypes.INTEGER,
            comment: DataTypes.TEXT
        },
        {
            indexes: [
                { fields: ["post_id", "createdAt"], name: "comments_post_id_created_at_idx" }
            ]
        }
    );
};
