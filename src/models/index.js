const { sequelize, Sequelize } = require('./database');
const Student = require('./Student');
const University = require('./University');
const Course = require('./Course');
const CourseModule = require('./CourseModule');

University.hasMany(Course, {
  foreignKey: 'universityId',
  as: 'courses',
});

Course.belongsTo(University, {
  foreignKey: 'universityId',
  as: 'university',
});

Course.hasMany(CourseModule, {
  foreignKey: 'courseId',
  as: 'modules',
  onDelete: 'CASCADE',
});

CourseModule.belongsTo(Course, {
  foreignKey: 'courseId',
  as: 'course',
});

module.exports = {
  sequelize,
  Sequelize,
  Student,
  University,
  Course,
  CourseModule,
};
