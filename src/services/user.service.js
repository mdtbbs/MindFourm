const db = require('../database');

class UserService {
  static getById(id) {
    return db.prepare(`
      SELECT u.id, u.mindauth_id, u.username, u.email, u.role, u.avatar_url, u.bio, u.created_at,
             (SELECT COUNT(*) FROM posts WHERE user_id = u.id AND deleted_at IS NULL) as post_count,
             (SELECT COUNT(*) FROM replies WHERE user_id = u.id AND deleted_at IS NULL) as reply_count
      FROM users u
      WHERE u.id = ?
    `).get(id);
  }

  static getByMindAuthId(mindauthId) {
    return db.prepare('SELECT * FROM users WHERE mindauth_id = ?').get(mindauthId);
  }

  static updateProfile(id, { username, bio }) {
    const updates = {};
    if (username !== undefined) updates.username = username;
    if (bio !== undefined) updates.bio = bio;

    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), id];

    db.prepare(`UPDATE users SET ${fields} WHERE id = ?`).run(...values);
    return this.getById(id);
  }

  static updateAvatar(id, avatarUrl) {
    db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, id);
    return this.getById(id);
  }

  static removeAvatar(id) {
    db.prepare('UPDATE users SET avatar_url = NULL WHERE id = ?').run(id);
    return this.getById(id);
  }

  static getRepliesByUserId(userId, { page = 1, limit = 50 }) {
    const offset = (page - 1) * limit;

    const replies = db.prepare(`
      SELECT r.*, u.mindauth_id as author_mindauth_id, u.role as author_role,
             p.title as post_title
      FROM replies r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN posts p ON r.post_id = p.id
      WHERE r.user_id = ? AND r.deleted_at IS NULL
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, limit, offset);

    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM replies
      WHERE user_id = ? AND deleted_at IS NULL
    `).get(userId);

    return {
      data: replies,
      pagination: {
        page, limit, total: countResult.total,
        totalPages: Math.ceil(countResult.total / limit)
      }
    };
  }

  static updateRole(id, role) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
    return this.getById(id);
  }

  static getAll({ page = 1, limit = 50, search }) {
    const offset = (page - 1) * limit;
    const wheres = [];
    const params = [];

    if (search) {
      wheres.push('(username LIKE ? OR email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const where = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';

    const users = db.prepare(`
      SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const countResult = db.prepare(`SELECT COUNT(*) as total FROM users ${where}`).get(...params);

    return {
      data: users,
      pagination: { page, limit, total: countResult.total, totalPages: Math.ceil(countResult.total / limit) }
    };
  }
}

module.exports = UserService;
