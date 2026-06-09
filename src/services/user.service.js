const db = require('../database');

class UserService {
  static async getById(id) {
    return db.queryOne(`
      SELECT u.id, u.mindauth_id, u.username, u.email, u.role, u.avatar_url, u.bio, u.created_at,
             (SELECT COUNT(*) FROM posts WHERE user_id = u.id AND deleted_at IS NULL) as post_count,
             (SELECT COUNT(*) FROM replies WHERE user_id = u.id AND deleted_at IS NULL) as reply_count
      FROM users u
      WHERE u.id = ?
    `, [id]);
  }

  static toPublicProfile(user) {
    if (!user) return null;
    const { email, ...publicUser } = user;
    return publicUser;
  }

  static async getByMindAuthId(mindauthId) {
    return db.queryOne('SELECT * FROM users WHERE mindauth_id = ?', [mindauthId]);
  }

  static async updateProfile(id, { username, bio }) {
    const updates = {};
    if (username !== undefined) updates.username = username;
    if (bio !== undefined) updates.bio = bio;

    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), id];

    await db.execute(`UPDATE users SET ${fields} WHERE id = ?`, values);
    return this.getById(id);
  }

  static async updateAvatar(id, avatarUrl) {
    await db.execute('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, id]);
    return this.getById(id);
  }

  static async removeAvatar(id) {
    await db.execute('UPDATE users SET avatar_url = NULL WHERE id = ?', [id]);
    return this.getById(id);
  }

  static async getRepliesByUserId(userId, { page = 1, limit = 50 }) {
    const offset = (page - 1) * limit;

    const replies = await db.query(`
      SELECT r.*, u.mindauth_id as author_mindauth_id, u.role as author_role,
             p.title as post_title
      FROM replies r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN posts p ON r.post_id = p.id
      WHERE r.user_id = ? AND r.deleted_at IS NULL
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, limit, offset]);

    const countResult = await db.queryOne(`
      SELECT COUNT(*) as total FROM replies
      WHERE user_id = ? AND deleted_at IS NULL
    `, [userId]);

    return {
      data: replies,
      pagination: {
        page, limit, total: countResult.total,
        totalPages: Math.ceil(countResult.total / limit)
      }
    };
  }

  static async updateRole(id, role) {
    await db.execute('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    return this.getById(id);
  }

  static async getAll({ page = 1, limit = 50, search }) {
    const offset = (page - 1) * limit;
    const wheres = [];
    const params = [];

    if (search) {
      wheres.push('(username LIKE ? OR email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const where = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';

    const users = await db.query(`
      SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const countResult = await db.queryOne(`SELECT COUNT(*) as total FROM users ${where}`, params);

    return {
      data: users,
      pagination: { page, limit, total: countResult.total, totalPages: Math.ceil(countResult.total / limit) }
    };
  }

  static async searchByUsername(query, limit = 10) {
    return db.query(`
      SELECT id, username, avatar_url
      FROM users
      WHERE username LIKE ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [`%${query}%`, limit]);
  }
}

module.exports = UserService;