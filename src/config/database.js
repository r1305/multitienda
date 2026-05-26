require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_DATABASE,
  process.env.DB_USERNAME,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: false,
    pool: {
      max: 3,
      min: 0,
      acquire: 20000,
      idle: 30000,
      evict: 60000
    },
    define: {
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: false,
    },
    retry: { max: 2 },
    dialectOptions: {
      connectTimeout: 10000,
      // Reuse connections efficiently
      flags: ['-FOUND_ROWS']
    }
  }
);

module.exports = sequelize;
