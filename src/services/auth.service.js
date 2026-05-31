const crypto = require('crypto');
const config = require('../config');
const db = require('../database');
const redis = require('../database/redis');

class AuthService {
  static async exchangeCode(code) {
    try {
      // Step 1: Exchange authorization code for tokens
      const tokenRes = await fetch(`${config.mindauth.baseUrl}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          client_id: config.mindauth.clientId,
          client_secret: config.mindauth.clientSecret,
          grant_type: 'authorization_code'
        })
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.json();
        console.error('MindAuth token exchange failed:', tokenRes.status, err);
        return null;
      }

      const tokens = await tokenRes.json();

      // Step 2: Get user info from userinfo endpoint
      const userRes = await fetch(`${config.mindauth.baseUrl}/api/userinfo`, {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` }
      });

      if (!userRes.ok) {
        console.error('MindAuth userinfo failed:', userRes.status);
        return null;
      }

      const info = await userRes.json();
      // updated_at 是 created_at 的 epoch timestamp (秒)
      const createdAt = info.updated_at ? new Date(info.updated_at * 1000).toISOString() : null;
      return { id: info.sub, username: info.name, email: info.email, created_at: createdAt };
    } catch (error) {
      console.error('MindAuth exchange error:', error);
      return null;
    }
  }

  static async verifyMindAuthSession(sessionToken) {
    try {
      const response = await fetch(`${config.mindauth.baseUrl}/api/verify`, {
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
      // 创建新用户时同步 MindAuth 的 created_at
      const result = await db.execute(
        'INSERT INTO users (mindauth_id, username, email, role, created_at) VALUES (?, ?, ?, ?, ?)',
        [mindauthUser.id, mindauthUser.username, mindauthUser.email, 'user', mindauthUser.created_at || new Date().toISOString()]
      );
      user = await db.queryOne('SELECT * FROM users WHERE id = ?', [result.insertId]);
    } else {
      // Update username/email only if changed (不更新 created_at，保留首次登录时间)
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
        [userId, sessionToken, 'create', ipAddress]
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
          [parseInt(sessionData.user_id, 10), sessionToken, 'destroy']
        );
      } catch (err) {
        console.warn('Session audit log failed:', err.message);
      }
    }
  }

  static async destroyAllUserSessions(userId) {
    // Find all session keys for this user
    const keys = await redis.keys('session:*');
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