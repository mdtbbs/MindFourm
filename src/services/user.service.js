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