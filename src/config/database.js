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
      max: 5,        // Reduced for shared hosting
      min: 0,
      acquire: 30000,
      idle: 5000,    // Release idle connections faster
      evict: 10000   // Check for idle connections every 10s
    },
    define: {
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: false,
    },
    retry: { max: 3 },
    dialectOptions: {
      connectTimeout: 10000
    }
  }
);

module.exports = sequelize;
