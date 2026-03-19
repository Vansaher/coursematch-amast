const { DataTypes } = require('sequelize');
const { sequelize } = require('./database');

const UserMatchSession = sequelize.define(
  'UserMatchSession',
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
    label: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sessionType: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'session_type',
    },
    inputSnapshot: {
      type: DataTypes.JSON,
      allowNull: false,
      field: 'input_snapshot',
    },
    resultsSnapshot: {
      type: DataTypes.JSON,
      allowNull: false,
      field: 'results_snapshot',
    },
  },
  {
    timestamps: true,
    tableName: 'user_match_sessions',
    createdAt: 'created_at',
    updatedAt: false,
  }
);

module.exports = UserMatchSession;
