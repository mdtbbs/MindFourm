/**
 * Minimal MindAuth Mock Server
 *
 * Provides just enough OAuth/OIDC functionality to test the MindFourm
 * integration locally without a real MindAuth instance.
 *
 * Implements the endpoints the forum actually calls:
 *   GET  /.well-known/openid-configuration
 *   POST /api/token         (authorization_code + refresh_token grants)
 *   GET  /api/userinfo      (Bearer token → user profile)
 *   GET  /api/user          (fallback alias of /api/userinfo)
 *   POST /api/revoke        (token revocation)
 *   POST /api/service/validate-credentials  (service-to-service, X-Service-API-Key)
 *
 * NOT for production use. Only for development and capability testing.
 *
 * Usage: npm run mock:mindauth
 */

import express from 'express';
import { randomUUID, createHash } from 'crypto';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = parseInt(process.env.MINDAUTH_MOCK_PORT || '4501', 10);
const CLIENT_ID = process.env.MINDAUTH_CLIENT_ID || 'forum';
const CLIENT_SECRET = process.env.MINDAUTH_CLIENT_SECRET || 'forum_secret_key_for_development';
const SERVICE_API_KEY = process.env.MINDAUTH_SERVICE_API_KEY || 'mock_service_key';

// In-memory authorization codes (single-use)
const authCodes = new Map<string, {
  clientId: string;
  redirectUri: string;
  userId: number;
  codeChallenge?: string;
  createdAt: number;
}>();

// In-memory access tokens
const accessTokens = new Map<string, {
  userId: number;
  clientId: string;
  expiresAt: Date;
}>();

// In-memory refresh tokens
const refreshTokens = new Map<string, {
  userId: number;
  clientId: string;
}>();

// Mock users
const MOCK_USERS: Record<number, {
  id: number;
  username: string;
  email: string;
  avatar_url: string;
  phone_verified: boolean;
  phone_verified_at: string | null;
  password: string;
}> = {
  1: {
    id: 1,
    username: 'mock_user',
    email: 'mock@example.com',
    avatar_url: '',
    phone_verified: true,
    phone_verified_at: '2026-01-01T00:00:00Z',
    password: 'mock_password',
  },
};

// OIDC Discovery
app.get('/.well-known/openid-configuration', (_req, res) => {
  const baseUrl = `http://localhost:${PORT}`;
  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/api/token`,
    userinfo_endpoint: `${baseUrl}/api/userinfo`,
    jwks_uri: `${baseUrl}/.well-known/jwks.json`,
    revocation_endpoint: `${baseUrl}/api/revoke`,
    introspection_endpoint: `${baseUrl}/api/introspect`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['HS256'],
    scopes_supported: ['openid', 'profile', 'email'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    code_challenge_methods_supported: ['S256', 'plain'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
  });
});

// JWKS (mock — returns empty for HS256)
app.get('/.well-known/jwks.json', (_req, res) => {
  res.json({ keys: [] });
});

// Authorization endpoint (mock — immediately redirects with code)
app.get('/authorize', (req, res) => {
  const {
    client_id,
    redirect_uri,
    response_type,
    state,
    code_challenge,
  } = req.query as Record<string, string>;

  if (client_id !== CLIENT_ID) {
    res.status(400).json({ error: 'invalid_client' });
    return;
  }
  if (response_type !== 'code') {
    res.status(400).json({ error: 'unsupported_response_type' });
    return;
  }

  const code = randomUUID();
  authCodes.set(code, {
    clientId: client_id,
    redirectUri: redirect_uri || '',
    userId: 1,
    codeChallenge: code_challenge,
    createdAt: Date.now(),
  });

  // Auto-expire code after 10 minutes
  setTimeout(() => authCodes.delete(code), 10 * 60 * 1000);

  const redirectUrl = new URL(redirect_uri || 'http://localhost:4000/api/auth/callback');
  redirectUrl.searchParams.set('code', code);
  if (state) redirectUrl.searchParams.set('state', state);

  res.redirect(redirectUrl.toString());
});

// Token endpoint
app.post('/api/token', (req, res) => {
  const {
    grant_type,
    code,
    redirect_uri,
    client_id,
    client_secret,
    refresh_token,
  } = req.body;

  // Validate client
  if (client_id !== CLIENT_ID || client_secret !== CLIENT_SECRET) {
    res.status(401).json({ error: 'invalid_client' });
    return;
  }

  if (grant_type === 'authorization_code') {
    const authData = authCodes.get(code);
    if (!authData) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'Code not found or expired' });
      return;
    }
    if (authData.clientId !== client_id) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'Client mismatch' });
      return;
    }

    authCodes.delete(code); // Single-use

    const accessToken = randomUUID();
    const refreshTokenValue = randomUUID();
    accessTokens.set(accessToken, {
      userId: authData.userId,
      clientId: client_id,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    refreshTokens.set(refreshTokenValue, {
      userId: authData.userId,
      clientId: client_id,
    });

    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: refreshTokenValue,
      scope: 'openid profile email',
    });
  } else if (grant_type === 'refresh_token') {
    const refreshData = refreshTokens.get(refresh_token);
    if (!refreshData) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'Refresh token not found' });
      return;
    }

    // Rotate refresh token
    refreshTokens.delete(refresh_token);

    const accessToken = randomUUID();
    const newRefreshToken = randomUUID();
    accessTokens.set(accessToken, {
      userId: refreshData.userId,
      clientId: refreshData.clientId,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    refreshTokens.set(newRefreshToken, {
      userId: refreshData.userId,
      clientId: refreshData.clientId,
    });

    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: newRefreshToken,
      scope: 'openid profile email',
    });
  } else {
    res.status(400).json({ error: 'unsupported_grant_type' });
  }
});

function extractUserFromBearer(req: express.Request, res: express.Response): number | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'invalid_token' });
    return null;
  }

  const token = auth.substring(7);
  const tokenData = accessTokens.get(token);
  if (!tokenData || tokenData.expiresAt < new Date()) {
    res.status(401).json({ error: 'invalid_token' });
    return null;
  }

  return tokenData.userId;
}

// Userinfo endpoint
app.get('/api/userinfo', (req, res) => {
  const userId = extractUserFromBearer(req, res);
  if (userId === null) return;

  const user = MOCK_USERS[userId];
  if (!user) {
    res.status(404).json({ error: 'user_not_found' });
    return;
  }

  res.json({
    sub: String(user.id),
    id: user.id,
    username: user.username,
    name: user.username,
    email: user.email,
    avatar_url: user.avatar_url,
    phone_verified: user.phone_verified,
    phone_verified_at: user.phone_verified_at,
  });
});

// Fallback /user endpoint (alias)
app.get('/api/user', (req, res) => {
  const userId = extractUserFromBearer(req, res);
  if (userId === null) return;

  const user = MOCK_USERS[userId];
  if (!user) {
    res.status(404).json({ error: 'user_not_found' });
    return;
  }

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    avatar_url: user.avatar_url,
    phone_verified: user.phone_verified,
    phone_verified_at: user.phone_verified_at,
  });
});

// Revocation endpoint
app.post('/api/revoke', (req, res) => {
  const { access_token, refresh_token: rt } = req.body;
  if (access_token) accessTokens.delete(access_token);
  if (rt) refreshTokens.delete(rt);
  res.status(200).json({});
});

// Introspection endpoint
app.post('/api/introspect', (req, res) => {
  const { token } = req.body;
  const tokenData = accessTokens.get(token);

  if (!tokenData || tokenData.expiresAt < new Date()) {
    res.json({ active: false });
    return;
  }

  res.json({
    active: true,
    sub: String(tokenData.userId),
    client_id: tokenData.clientId,
    exp: Math.floor(tokenData.expiresAt.getTime() / 1000),
    scope: 'openid profile email',
  });
});

// Service-to-service credential validation
app.post('/api/service/validate-credentials', (req, res) => {
  const serviceKey = req.headers['x-service-api-key'];
  if (serviceKey !== SERVICE_API_KEY) {
    res.status(401).json({ error: 'invalid_service_key' });
    return;
  }

  const { username, password } = req.body;
  const user = Object.values(MOCK_USERS).find(
    (u) => u.username === username && u.password === password,
  );

  if (!user) {
    res.json({ valid: false });
    return;
  }

  res.json({
    valid: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar_url: user.avatar_url,
      phone_verified: user.phone_verified,
      phone_verified_at: user.phone_verified_at,
    },
  });
});

// Root — simple reachable marker
app.get('/', (_req, res) => {
  res.json({ service: 'mindauth-mock', status: 'running' });
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', mock: true });
});

app.listen(PORT, () => {
  console.log(`MindAuth mock running on http://localhost:${PORT}`);
  console.log(`OIDC discovery: http://localhost:${PORT}/.well-known/openid-configuration`);
  console.log(`Client ID: ${CLIENT_ID}`);
  console.log(`Service API Key: ${SERVICE_API_KEY}`);
});
