const { DataTypes } = require('sequelize');
const { sequelize } = require('./database');

const University = sequelize.define('University', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  slug: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  country: { type: DataTypes.STRING, allowNull: false, defaultValue: 'Malaysia' },
  state: { type: DataTypes.STRING, allowNull: true },
  city: { type: DataTypes.STRING, allowNull: true },
  websiteUrl: {
    type: DataTypes.STRING(1024),
    allowNull: true,
    field: 'website_url',
  },
  sourceType: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'official',
    field: 'source_type',
  },
  metadata: { type: DataTypes.JSON, allowNull: true },
}, {
  timestamps: false,
  tableName: 'universities',
});

module.exports = University;
