module.exports = (sequelize, DataTypes) => {
    return sequelize.define("JobRequirementSnapshot", {
        application_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true
        },
        job_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        version: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        snapshot_data: {
            type: DataTypes.JSON,
            allowNull: false,
            get() {
                const rawValue = this.getDataValue('snapshot_data');
                if (typeof rawValue === 'string') {
                    try {
                        return JSON.parse(rawValue);
                    } catch {
                        return rawValue;
                    }
                }
                return rawValue;
            }
        }
    }, {
        tableName: "JobRequirementSnapshots",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: false
    });
};
