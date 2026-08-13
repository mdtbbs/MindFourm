const DEFAULT_PORT = 4000;

function resolvePort(): number {
  const parsed = parseInt(process.env.PORT || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

/** This service's own base URL, derived from PORT when API_URL is unset. */
function resolveApiUrl(): string {
  return process.env.API_URL || `http://localhost:${resolvePort()}`;
}

export const appConfig = () => ({
  app: {
    port: resolvePort(),
    env: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    apiUrl: resolveApiUrl(),
    internalApiKey: process.env.FORUM_INTERNAL_API_KEY || '',
  },
  mysql: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    // `mindfourm`, matching the repository's spelling — this is the database that
    // actually exists. Defaulting to `mindforum` meant a deployment without an
    // explicit MYSQL_DATABASE connected to a database that had never been created.
    database: process.env.MYSQL_DATABASE || 'mindfourm',
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
    // Derived from this service's own base URL rather than a fixed default. A
    // hardcoded `http://localhost:4000/...` fallback silently contradicted
    // deployments running on another port (this one uses 4500), producing a
    // redirect_uri MindAuth rejects during the token exchange.
    callbackUrl: process.env.MINDAUTH_CALLBACK_URL || `${resolveApiUrl()}/api/auth/callback`,
  },
  easymanager: {
    enabled: process.env.EASYMANAGER_ENABLED === 'true',
    baseUrl: process.env.EASYMANAGER_URL || 'http://localhost:5001',
    apiKey: process.env.EASYMANAGER_API_KEY || '',
  },
  mfl: {
    baseUrl: process.env.MFL_BASE_URL || '',
    apiKey: process.env.MFL_API_KEY || '',
  },
  automation: {
    apiKey: process.env.FORUM_API_KEY || '',
  },
  lanlink: {
    enabled: process.env.LANLINK_ENABLED === 'true',
    baseUrl: process.env.LANLINK_URL || '',
  },
  forge: {
    baseUrl: process.env.MDT_FORGE_URL || '',
    apiKey: process.env.MDT_FORGE_API_KEY || '',
  },
  session: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
});
