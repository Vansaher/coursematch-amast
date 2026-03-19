const { sequelize, Sequelize } = require('./database');
const Student = require('./Student');
const University = require('./University');
const Course = require('./Course');
const CourseModule = require('./CourseModule');
const UserAccount = require('./UserAccount');
const UserSavedCourse = require('./UserSavedCourse');
const UserComparison = require('./UserComparison');
const UserMatchSession = require('./UserMatchSession');
const UserPlannerItem = require('./UserPlannerItem');
const UserCourseDraft = require('./UserCourseDraft');

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

UserAccount.hasMany(UserSavedCourse, {
  foreignKey: 'userId',
  as: 'savedCourses',
  onDelete: 'CASCADE',
});

UserSavedCourse.belongsTo(UserAccount, {
  foreignKey: 'userId',
  as: 'user',
});

UserSavedCourse.belongsTo(Course, {
  foreignKey: 'courseId',
  as: 'course',
});

Course.hasMany(UserSavedCourse, {
  foreignKey: 'courseId',
  as: 'savedByUsers',
});

UserAccount.hasMany(UserComparison, {
  foreignKey: 'userId',
  as: 'comparisons',
  onDelete: 'CASCADE',
});

UserComparison.belongsTo(UserAccount, {
  foreignKey: 'userId',
  as: 'user',
});

UserAccount.hasMany(UserMatchSession, {
  foreignKey: 'userId',
  as: 'matchSessions',
  onDelete: 'CASCADE',
});

UserMatchSession.belongsTo(UserAccount, {
  foreignKey: 'userId',
  as: 'user',
});

UserAccount.hasMany(UserPlannerItem, {
  foreignKey: 'userId',
  as: 'plannerItems',
  onDelete: 'CASCADE',
});

UserPlannerItem.belongsTo(UserAccount, {
  foreignKey: 'userId',
  as: 'user',
});

UserPlannerItem.belongsTo(Course, {
  foreignKey: 'courseId',
  as: 'course',
});

UserAccount.hasMany(UserCourseDraft, {
  foreignKey: 'userId',
  as: 'courseDrafts',
  onDelete: 'CASCADE',
});

UserCourseDraft.belongsTo(UserAccount, {
  foreignKey: 'userId',
  as: 'user',
});

UserCourseDraft.belongsTo(Course, {
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
  UserAccount,
  UserSavedCourse,
  UserComparison,
  UserMatchSession,
  UserPlannerItem,
  UserCourseDraft,
};
