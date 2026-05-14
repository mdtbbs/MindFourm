require('dotenv').config();
const path = require('path');

module.exports = {
  app: {
    port: parseInt(process.env.PORT, 10) || 4000,
    env: process.env.NODE_ENV || 'development',
    baseUrl: process.env.BASE_URL || 'http://localhost:3000'
  },

  database: {
    path: process.env.DB_PATH || path.join(__dirname, '../../data/forum.db')
  },

  mindauth: {
    baseUrl: process.env.MINDAUTH_URL || 'http://localhost:4001',
    clientId: process.env.MINDAUTH_CLIENT_ID,
    clientSecret: process.env.MINDAUTH_CLIENT_SECRET,
    callbackUrl: process.env.MINDAUTH_CALLBACK_URL || 'http://localhost:4000/api/auth/callback'
  },

  session: {
    maxAge: 30 * 24 * 60 * 60 * 1000
  }
};