const { Sequelize } = require('sequelize');
require('dotenv').config();

const baseOptions = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  dialect: 'mysql',
  logging: false,
};

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, baseOptions)
  : new Sequelize(
      process.env.DB_NAME || 'course_matching',
      process.env.DB_USER || 'root',
      process.env.DB_PASS || '',
      baseOptions
    );

module.exports = { sequelize, Sequelize };
