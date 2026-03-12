const { DataTypes } = require('sequelize');
const { sequelize } = require('./database');

const Student = sequelize.define('Student', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  scores: {
    type: DataTypes.JSON, // store as JSON object
    allowNull: true,
  },
  requirements: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  uploadedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  timestamps: false,
  tableName: 'students',
});

module.exports = Student;
