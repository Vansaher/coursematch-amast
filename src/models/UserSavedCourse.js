const { DataTypes } = require('sequelize');
const { sequelize } = require('./database');

const UserSavedCourse = sequelize.define(
  'UserSavedCourse',
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
    courseId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'course_id',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    tableName: 'user_saved_courses',
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [{ unique: true, fields: ['user_id', 'course_id'] }],
  }
);

module.exports = UserSavedCourse;
