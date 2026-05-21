const crypto = require('crypto');
const config = require('../config');
const db = require('../database');

class AuthService {
  static async exchangeCode(code) {
    try {
      const response = await fetch(`${config.mindauth.baseUrl}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          client_id: config.mindauth.clientId,
          client_secret: config.mindauth.clientSecret
        })
      });

      const result = await response.json();
      return result.success ? result.user : null;
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

  static getOrCreateUser(mindauthUser) {
    let user = db.prepare('SELECT * FROM users WHERE mindauth_id = ?').get(mindauthUser.id);

    if (!user) {
      const result = db.prepare('INSERT INTO users (mindauth_id, username, email, role) VALUES (?, ?, ?, ?)').run(mindauthUser.id, mindauthUser.username, mindauthUser.email, 'user');
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    } else {
      // Update username/email only if changed
      if (user.username !== mindauthUser.username || user.email !== mindauthUser.email) {
        db.prepare('UPDATE users SET username = ?, email = ? WHERE mindauth_id = ?').run(mindauthUser.username, mindauthUser.email, mindauthUser.id);
        user.username = mindauthUser.username;
        user.email = mindauthUser.email;
      }
    }

    return user;
  }

  static createSession(userId) {
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + config.session.maxAge);

    db.prepare(`
      INSERT INTO sessions (user_id, session_token, expires_at)
      VALUES (?, ?, ?)
    `).run(userId, sessionToken, expiresAt.toISOString());

    return sessionToken;
  }

  static validateSession(sessionToken) {
    const session = db.prepare(`
      SELECT s.*, u.role, u.mindauth_id, u.username, u.email, u.created_at as user_created_at
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.session_token = ? AND s.expires_at > ?
    `).get(sessionToken, new Date().toISOString());

    return session || null;
  }

  static getUserByMindauthId(mindauthId) {
    // For OAuth sessions, get user info from our local database
    const user = db.prepare('SELECT * FROM users WHERE mindauth_id = ?').get(mindauthId);
    if (!user) return null;

    return {
      id: mindauthId,
      username: user.username,
      email: user.email,
      created_at: user.created_at
    };
  }

  static destroySession(sessionToken) {
    db.prepare('DELETE FROM sessions WHERE session_token = ?').run(sessionToken);
  }

  static destroyAllUserSessions(userId) {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }

  static cleanExpiredSessions() {
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  }
}

module.exports = AuthService;