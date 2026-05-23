const db = require('../database');

class ResourceVersionService {
  static async list(resourceId) {
    return db.query(`
      SELECT * FROM resource_versions WHERE resource_id = ? ORDER BY created_at DESC
    `, [resourceId]);
  }

  static async create({ resource_id, version, file_path }) {
    const result = await db.execute(`
      INSERT INTO resource_versions (resource_id, version, file_path)
      VALUES (?, ?, ?)
    `, [resource_id, version, file_path || null]);
    return db.queryOne('SELECT * FROM resource_versions WHERE id = ?', [result.insertId]);
  }

  static async delete(id, resourceId) {
    const v = await db.queryOne('SELECT * FROM resource_versions WHERE id = ? AND resource_id = ?', [id, resourceId]);
    if (!v) return null;
    await db.execute('DELETE FROM resource_versions WHERE id = ? AND resource_id = ?', [id, resourceId]);
    return v;
  }
}

module.exports = ResourceVersionService;