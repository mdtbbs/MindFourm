const db = require('../database');
const { encodeCursor, decodeCursor } = require('../utils/cursor');
const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, '../uploads/resources');

class ResourceService {
  static create({ user_id, title, description, file_name, file_path, file_size, mime_type, category, is_public }) {
    const result = db.prepare(`
      INSERT INTO resources (user_id, title, description, file_name, file_path, file_size, mime_type, category, is_public)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(user_id, title, description || null, file_name, file_path, file_size, mime_type, category || null, is_public ? 1 : 0);

    return db.prepare('SELECT * FROM resources WHERE id = ?').get(result.lastInsertRowid);
  }

  static getList({ limit = 20, cursor, category, search, status }) {
    const whereClauses = ['status = ?'];
    const params = [status || 'approved'];

    if (category) {
      whereClauses.push('category = ?');
      params.push(category);
    }

    if (search) {
      whereClauses.push('(title LIKE ? OR description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (cursor) {
      const [createdAt, id] = decodeCursor(cursor);
      whereClauses.push('(created_at < ? OR (created_at = ? AND id < ?))');
      params.push(createdAt, createdAt, parseInt(id));
    }

    const whereClause = whereClauses.join(' AND ');

    const resources = db.prepare(`
      SELECT r.*, u.username, u.avatar_url
      FROM resources r
      JOIN users u ON r.user_id = u.id
      WHERE ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT ?
    `).all(...params, limit + 1);

    const hasMore = resources.length > limit;
    if (hasMore) resources.pop();

    const nextCursor = resources.length > 0
      ? encodeCursor(resources[resources.length - 1].created_at, resources[resources.length - 1].id)
      : null;

    return { data: resources, next_cursor: nextCursor, has_more: hasMore };
  }

  static getById(id) {
    return db.prepare(`
      SELECT r.*, u.username, u.avatar_url
      FROM resources r
      JOIN users u ON r.user_id = u.id
      WHERE r.id = ?
    `).get(id);
  }

  static incrementDownload(id) {
    db.prepare('UPDATE resources SET download_count = download_count + 1 WHERE id = ?').run(id);
  }

  static getByUserId(userId, { limit = 20, cursor }) {
    const whereClauses = ['user_id = ?'];
    const params = [userId];

    if (cursor) {
      const [createdAt, id] = decodeCursor(cursor);
      whereClauses.push('(created_at < ? OR (created_at = ? AND id < ?))');
      params.push(createdAt, createdAt, parseInt(id));
    }

    const resources = db.prepare(`
      SELECT * FROM resources WHERE ${whereClauses.join(' AND ')}
      ORDER BY created_at DESC LIMIT ?
    `).all(...params, limit + 1);

    const hasMore = resources.length > limit;
    if (hasMore) resources.pop();

    const nextCursor = resources.length > 0
      ? encodeCursor(resources[resources.length - 1].created_at, resources[resources.length - 1].id)
      : null;

    return { data: resources, next_cursor: nextCursor, has_more: hasMore };
  }

  static delete(id, userId) {
    const resource = this.getById(id);
    if (!resource) return null;

    // Remove file
    try {
      const fullPath = path.join(__dirname, '..', resource.file_path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch (e) { /* ignore */ }

    db.prepare('DELETE FROM resources WHERE id = ?').run(id);
    return true;
  }

  static getCategories() {
    return db.prepare(`
      SELECT DISTINCT category, COUNT(*) as count
      FROM resources
      WHERE status = 'approved' AND category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
    `).all();
  }

  static updateStatus(id, status) {
    db.prepare('UPDATE resources SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
    return this.getById(id);
  }
}

module.exports = ResourceService;
