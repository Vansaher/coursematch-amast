const { DataTypes } = require('sequelize');
const { sequelize } = require('./database');

const CourseModule = sequelize.define('CourseModule', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  courseId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'course_id',
  },
  yearLabel: { type: DataTypes.STRING, allowNull: true, field: 'year_label' },
  termLabel: { type: DataTypes.STRING, allowNull: true, field: 'term_label' },
  category: { type: DataTypes.STRING, allowNull: true },
  code: { type: DataTypes.STRING, allowNull: true },
  title: { type: DataTypes.STRING, allowNull: false },
  credits: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
  sortOrder: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 0,
    field: 'sort_order',
  },
  metadata: { type: DataTypes.JSON, allowNull: true },
}, {
  timestamps: false,
  tableName: 'course_modules',
});

module.exports = CourseModule;
