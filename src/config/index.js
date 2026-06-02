require('dotenv').config();
const path = require('path');

module.exports = {
  app: {
    port: parseInt(process.env.PORT, 10) || 4000,
    env: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    apiUrl: process.env.API_URL || 'http://localhost:4000'
  },

  mysql: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'mindforum',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  },

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB, 10) || 0
  },

  mindauth: {
    baseUrl: process.env.MINDAUTH_URL || 'http://localhost:4001',
    clientId: process.env.MINDAUTH_CLIENT_ID,
    clientSecret: process.env.MINDAUTH_CLIENT_SECRET,
    callbackUrl: process.env.MINDAUTH_CALLBACK_URL || 'http://localhost:4000/api/auth/callback'
  },

  easymanager: {
    baseUrl: process.env.EASYMANAGER_URL || 'http://localhost:5001',
    apiKey: process.env.EASYMANAGER_API_KEY || 'forum-service-key-dev'
  },

  session: {
    maxAge: 30 * 24 * 60 * 60 * 1000  // 30 days
  }
};