const db = require('../database');

class UserService {
  static getById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }

  static getByMindAuthId(mindauthId) {
    return db.prepare('SELECT * FROM users WHERE mindauth_id = ?').get(mindauthId);
  }

  static updateRole(id, role) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
    return this.getById(id);
  }

  static getAll({ page = 1, limit = 50 }) {
    const offset = (page - 1) * limit;

    const users = db.prepare(`
      SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(limit, offset);

    const countResult = db.prepare('SELECT COUNT(*) as total FROM users').get();

    return {
      data: users,
      pagination: {
        page,
        limit,
        total: countResult.total,
        totalPages: Math.ceil(countResult.total / limit)
      }
    };
  }
}

module.exports = UserService;