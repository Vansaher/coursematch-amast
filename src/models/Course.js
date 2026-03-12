const { DataTypes } = require('sequelize');
const { sequelize } = require('./database');

const Course = sequelize.define('Course', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  universityId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    field: 'university_id',
  },
  code: { type: DataTypes.STRING, allowNull: true },
  slug: { type: DataTypes.STRING, allowNull: true },
  name: { type: DataTypes.STRING, allowNull: false },
  awardLevel: {
    type: DataTypes.ENUM(
      'foundation',
      'certificate',
      'diploma',
      'bachelor',
      'master',
      'doctorate',
      'other'
    ),
    allowNull: false,
    defaultValue: 'other',
    field: 'award_level',
  },
  faculty: { type: DataTypes.STRING, allowNull: true },
  studyMode: { type: DataTypes.STRING, allowNull: true, field: 'study_mode' },
  durationText: { type: DataTypes.STRING, allowNull: true, field: 'duration_text' },
  durationSemesters: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    field: 'duration_semesters',
  },
  intakeText: { type: DataTypes.TEXT, allowNull: true, field: 'intake_text' },
  tuitionText: { type: DataTypes.TEXT, allowNull: true, field: 'tuition_text' },
  description: { type: DataTypes.TEXT, allowNull: true },
  entryRequirements: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'entry_requirements',
  },
  careerProspects: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'career_prospects',
  },
  sourceUrl: {
    type: DataTypes.STRING(512),
    allowNull: true,
    field: 'source_url',
  },
  lastScrapedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_scraped_at',
  },
  requirements: { type: DataTypes.JSON, allowNull: true },
  metadata: { type: DataTypes.JSON, allowNull: true },
}, {
  timestamps: false,
  tableName: 'courses',
});

module.exports = Course;
