require('dotenv').config();
const { Sequelize } = require('sequelize');

const poolMax = parseInt(process.env.DB_POOL_MAX || '5', 10);
const poolMin = parseInt(process.env.DB_POOL_MIN || '0', 10);

const sequelize = new Sequelize(
  process.env.DB_DATABASE,
  process.env.DB_USERNAME,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
    pool: {
      max: poolMax,
      min: poolMin,
      acquire: parseInt(process.env.DB_POOL_ACQUIRE || '20000', 10),
      idle: parseInt(process.env.DB_POOL_IDLE || '30000', 10),
      evict: parseInt(process.env.DB_POOL_EVICT || '60000', 10),
    },
    define: {
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: false,
    },
    retry: { max: 2 },
    dialectOptions: {
      connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT || '10000', 10),
      flags: ['-FOUND_ROWS'],
    },
  }
);

module.exports = sequelize;
