const { DataTypes } = require('sequelize');
const { sequelize } = require('./database');

const UserCourseDraft = sequelize.define(
  'UserCourseDraft',
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
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    timestamps: true,
    tableName: 'user_course_drafts',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [{ unique: true, fields: ['user_id', 'course_id'] }],
  }
);

module.exports = UserCourseDraft;
