const { DataTypes } = require('sequelize');
const { sequelize } = require('./database');

const UserPlannerItem = sequelize.define(
  'UserPlannerItem',
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
      allowNull: true,
      field: 'course_id',
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    details: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    dueDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'due_date',
    },
    status: {
      type: DataTypes.ENUM('planned', 'in_progress', 'done'),
      allowNull: false,
      defaultValue: 'planned',
    },
  },
  {
    timestamps: true,
    tableName: 'user_planner_items',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

module.exports = UserPlannerItem;
