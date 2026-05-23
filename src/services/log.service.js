const db = require('../database');
const { LOG_ACTIONS } = require('../utils/constants');

class LogService {
  static async log({ user_id, action, target_type, target_id, details, ip_address, user_agent }) {
    await db.execute(`
      INSERT INTO operation_logs (user_id, action, target_type, target_id, details, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      user_id || null,
      action,
      target_type || null,
      target_id || null,
      details ? JSON.stringify(details) : null,
      ip_address || null,
      user_agent || null
    ]);
  }

  static async getLogs({ page = 1, limit = 50, user_id, action, target_type }) {
    const offset = (page - 1) * limit;
    const whereClauses = [];
    const params = [];

    if (user_id) {
      whereClauses.push('user_id = ?');
      params.push(user_id);
    }

    if (action) {
      whereClauses.push('action = ?');
      params.push(action);
    }

    if (target_type) {
      whereClauses.push('target_type = ?');
      params.push(target_type);
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const logs = await db.query(`
      SELECT l.*, u.mindauth_id
      FROM operation_logs l
      LEFT JOIN users u ON l.user_id = u.id
      ${whereClause}
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const countResult = await db.queryOne(`SELECT COUNT(*) as total FROM operation_logs ${whereClause}`, params);

    return {
      data: logs,
      pagination: {
        page,
        limit,
        total: countResult.total,
        totalPages: Math.ceil(countResult.total / limit)
      }
    };
  }
}

module.exports = LogService;