const { DataTypes } = require('sequelize');
const { sequelize } = require('./database');

const UserComparison = sequelize.define(
  'UserComparison',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'user_id',
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    courseIds: {
      type: DataTypes.JSON,
      allowNull: false,
      field: 'course_ids',
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    tableName: 'user_comparisons',
    createdAt: 'created_at',
    updatedAt: false,
  }
);

module.exports = UserComparison;
