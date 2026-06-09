export const appConfig = () => ({
  app: {
    port: parseInt(process.env.PORT || '4000', 10),
    env: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    apiUrl: process.env.API_URL || 'http://localhost:4000',
  },
  mysql: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'mindforum',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  mindauth: {
    baseUrl: process.env.MINDAUTH_URL || 'http://localhost:4001',
    clientId: process.env.MINDAUTH_CLIENT_ID || 'forum',
    clientSecret: process.env.MINDAUTH_CLIENT_SECRET || '',
    callbackUrl: process.env.MINDAUTH_CALLBACK_URL || 'http://localhost:3000/api/auth/callback',
  },
  easymanager: {
    baseUrl: process.env.EASYMANAGER_URL || 'http://localhost:5001',
    apiKey: process.env.EASYMANAGER_API_KEY || '',
  },
  session: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
});
