const { DataTypes } = require('sequelize');
const { sequelize } = require('./database');

const UserAccount = sequelize.define(
  'UserAccount',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    username: { type: DataTypes.STRING, allowNull: false, unique: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'password_hash',
    },
    passwordSalt: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'password_salt',
    },
    preferences: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_login_at',
    },
  },
  {
    timestamps: true,
    tableName: 'user_accounts',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

module.exports = UserAccount;
