module.exports = (sequelize, DataTypes) => {
    return sequelize.define("Resume", {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        title: {
            type: DataTypes.STRING(255),
            defaultValue: "My Resume"
        },
        template_id: {
            type: DataTypes.STRING(100),
            defaultValue: "modern-professional"
        },
        font_family: {
            type: DataTypes.STRING(100),
            defaultValue: "Inter, sans-serif"
        },
        font_size: {
            type: DataTypes.INTEGER,
            defaultValue: 11
        },
        line_spacing: {
            type: DataTypes.FLOAT,
            defaultValue: 1.5
        },
        color_theme: {
            type: DataTypes.STRING(100),
            defaultValue: "#155a43"
        },
        settings: {
            type: DataTypes.JSON,
            defaultValue: {}
        },
        is_default: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        is_archived: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    }, {
        tableName: "resumes",
        timestamps: true
    });
};