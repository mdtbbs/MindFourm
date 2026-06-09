const crypto = require('crypto');
const config = require('../config');
const db = require('../database');
const redis = require('../database/redis');

// 超时设置 (5秒)
const FETCH_TIMEOUT = 5000;

// 带超时的 fetch helper
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('请求超时');
    }
    throw error;
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// SCAN helper for Redis (避免 KEYS 阻塞)
async function scanKeys(pattern) {
  return redis.scan(pattern, 100);
}

class AuthService {
  static async exchangeCode(code) {
    try {
      // Step 1: Exchange code for tokens (RFC 6749)
      const tokenResponse = await fetchWithTimeout(`${config.mindauth.baseUrl}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          client_id: config.mindauth.clientId,
          client_secret: config.mindauth.clientSecret,
          grant_type: 'authorization_code'
        })
      });

      const tokenResult = await tokenResponse.json();
      if (!tokenResult.access_token) {
        console.error('MindAuth token exchange failed:', tokenResult);
        return null;
      }

      // Step 2: Get user info with access token (OIDC UserInfo endpoint)
      const userResponse = await fetchWithTimeout(`${config.mindauth.baseUrl}/api/userinfo`, {
        headers: { 'Authorization': `Bearer ${tokenResult.access_token}` }
      });

      const userInfo = await userResponse.json();
      if (!userInfo.sub) {
        console.error('MindAuth userinfo failed:', userInfo);
        return null;
      }

      // Return user in expected format
      return {
        id: userInfo.sub,
        username: userInfo.name || userInfo.email,
        email: userInfo.email
      };
    } catch (error) {
      console.error('MindAuth exchange error:', error);
      return null;
    }
  }

  static async verifyMindAuthSession(sessionToken) {
    try {
      const response = await fetchWithTimeout(`${config.mindauth.baseUrl}/api/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: sessionToken })
      });

      const result = await response.json();
      return result.success ? result.user : null;
    } catch (error) {
      console.error('MindAuth verify error:', error);
      return null;
    }
  }

  static async getOrCreateUser(mindauthUser) {
    let user = await db.queryOne('SELECT * FROM users WHERE mindauth_id = ?', [mindauthUser.id]);

    if (!user) {
      const result = await db.execute(
        'INSERT INTO users (mindauth_id, username, email, role) VALUES (?, ?, ?, ?)',
        [mindauthUser.id, mindauthUser.username, mindauthUser.email, 'user']
      );
      user = await db.queryOne('SELECT * FROM users WHERE id = ?', [result.insertId]);
    } else {
      // Update username/email only if changed
      if (user.username !== mindauthUser.username || user.email !== mindauthUser.email) {
        await db.execute(
          'UPDATE users SET username = ?, email = ? WHERE mindauth_id = ?',
          [mindauthUser.username, mindauthUser.email, mindauthUser.id]
        );
        user.username = mindauthUser.username;
        user.email = mindauthUser.email;
      }
    }

    return user;
  }

  static async createSession(userId, ipAddress = null) {
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const ttlSeconds = Math.floor(config.session.maxAge / 1000);

    // Store session in Redis hash
    await redis.hset(`session:${sessionToken}`, 'user_id', userId.toString());
    await redis.expire(`session:${sessionToken}`, ttlSeconds);

    // Log to MySQL session_audit
    try {
      await db.execute(
        'INSERT INTO session_audit (user_id, session_token, action, ip_address) VALUES (?, ?, ?, ?)',
        [userId, hashToken(sessionToken), 'create', ipAddress]
      );
    } catch (err) {
      console.warn('Session audit log failed:', err.message);
    }

    return sessionToken;
  }

  static async validateSession(sessionToken) {
    // Check Redis first
    const sessionData = await redis.hgetall(`session:${sessionToken}`);

    if (!sessionData || !sessionData.user_id) {
      return null;
    }

    // Get user info from MySQL
    const user = await db.queryOne(
      'SELECT id, role, mindauth_id, username, email, created_at FROM users WHERE id = ?',
      [parseInt(sessionData.user_id, 10)]
    );

    if (!user) {
      await redis.del(`session:${sessionToken}`);
      return null;
    }

    return {
      user_id: user.id,
      role: user.role,
      mindauth_id: user.mindauth_id,
      username: user.username,
      email: user.email,
      user_created_at: user.created_at
    };
  }

  static async getUserByMindauthId(mindauthId) {
    const user = await db.queryOne('SELECT * FROM users WHERE mindauth_id = ?', [mindauthId]);
    if (!user) return null;

    return {
      id: mindauthId,
      username: user.username,
      email: user.email,
      created_at: user.created_at
    };
  }

  static async destroySession(sessionToken) {
    const sessionData = await redis.hgetall(`session:${sessionToken}`);
    await redis.del(`session:${sessionToken}`);

    // Log to audit
    if (sessionData && sessionData.user_id) {
      try {
        await db.execute(
          'INSERT INTO session_audit (user_id, session_token, action) VALUES (?, ?, ?)',
          [parseInt(sessionData.user_id, 10), hashToken(sessionToken), 'destroy']
        );
      } catch (err) {
        console.warn('Session audit log failed:', err.message);
      }
    }
  }

  static async destroyAllUserSessions(userId) {
    // Find all session keys for this user using SCAN (避免 KEYS 阻塞)
    const keys = await scanKeys('session:*');
    for (const key of keys) {
      const data = await redis.hget(key, 'user_id');
      if (data === userId.toString()) {
        await redis.del(key);
      }
    }
  }

  static async cleanExpiredSessions() {
    // Redis handles expiration automatically via TTL
    console.log('Session cleanup handled by Redis TTL');
  }
}

module.exports = AuthService;