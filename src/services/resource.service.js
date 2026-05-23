const db = require('../database');
const { encodeCursor, decodeCursor } = require('../utils/cursor');
const { parseMarkdown } = require('../utils/markdown');
const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, '../uploads/resources');

class ResourceService {
  static async create({ user_id, title, description, resource_type, file_name, file_path, file_size, mime_type, external_url, version, content, content_html, category_id, is_public }) {
    const result = await db.execute(`
      INSERT INTO resources (user_id, title, description, resource_type, file_name, file_path, file_size, mime_type, external_url, version, content, content_html, category_id, is_public)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      user_id, title, description || null, resource_type || 'file',
      file_name || null, file_path || null, file_size || 0, mime_type || null,
      external_url || null, version || null, content || null, content_html || null,
      category_id || null, is_public ? 1 : 0
    ]);
    return this.getById(result.insertId);
  }

  static async getList({ limit = 20, cursor, category_id, search, status, sort }) {
    const whereClauses = ['status = ?'];
    const params = [status || 'approved'];

    if (category_id) {
      whereClauses.push('r.category_id = ?');
      params.push(parseInt(category_id));
    }

    if (search) {
      whereClauses.push('(r.title LIKE ? OR r.description LIKE ? OR r.content LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (cursor) {
      const [createdAt, id] = decodeCursor(cursor);
      whereClauses.push('(r.created_at < ? OR (r.created_at = ? AND r.id < ?))');
      params.push(createdAt, createdAt, parseInt(id));
    }

    const orderBy = sort === 'downloads' ? 'r.download_count DESC' : 'r.created_at DESC';
    const whereClause = whereClauses.join(' AND ');

    const resources = await db.query(`
      SELECT r.*, u.username, u.avatar_url,
             rc.name as category_name, rc.icon as category_icon
      FROM resources r
      JOIN users u ON r.user_id = u.id
      LEFT JOIN resource_categories rc ON r.category_id = rc.id
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ?
    `, [...params, limit + 1]);

    const hasMore = resources.length > limit;
    if (hasMore) resources.pop();

    const nextCursor = resources.length > 0
      ? encodeCursor(resources[resources.length - 1].created_at, resources[resources.length - 1].id)
      : null;

    return { data: resources, next_cursor: nextCursor, has_more: hasMore };
  }

  static async getById(id) {
    return db.queryOne(`
      SELECT r.*, u.username, u.avatar_url,
             rc.name as category_name, rc.icon as category_icon
      FROM resources r
      JOIN users u ON r.user_id = u.id
      LEFT JOIN resource_categories rc ON r.category_id = rc.id
      WHERE r.id = ?
    `, [id]);
  }

  static async getByResourceIdWithVersions(id) {
    const resource = await this.getById(id);
    if (!resource) return null;
    const versions = await db.query(`
      SELECT * FROM resource_versions WHERE resource_id = ? ORDER BY created_at DESC
    `, [id]);
    return { ...resource, versions };
  }

  static async incrementDownload(id) {
    await db.execute('UPDATE resources SET download_count = download_count + 1 WHERE id = ?', [id]);
  }

  static async getByUserId(userId, { limit = 20, cursor }) {
    const whereClauses = ['user_id = ?'];
    const params = [userId];

    if (cursor) {
      const [createdAt, id] = decodeCursor(cursor);
      whereClauses.push('(created_at < ? OR (created_at = ? AND id < ?))');
      params.push(createdAt, createdAt, parseInt(id));
    }

    const resources = await db.query(`
      SELECT * FROM resources WHERE ${whereClauses.join(' AND ')}
      ORDER BY created_at DESC LIMIT ?
    `, [...params, limit + 1]);

    const hasMore = resources.length > limit;
    if (hasMore) resources.pop();

    const nextCursor = resources.length > 0
      ? encodeCursor(resources[resources.length - 1].created_at, resources[resources.length - 1].id)
      : null;

    return { data: resources, next_cursor: nextCursor, has_more: hasMore };
  }

  static async update(id, userId, { title, description, version, content, content_html, category_id, is_public, external_url }) {
    const resource = await this.getById(id);
    if (!resource || resource.user_id !== userId) return null;

    const sets = [];
    const values = [];

    if (title !== undefined) { sets.push('title = ?'); values.push(title); }
    if (description !== undefined) { sets.push('description = ?'); values.push(description); }
    if (version !== undefined) { sets.push('version = ?'); values.push(version); }
    if (content !== undefined) { sets.push('content = ?'); values.push(content); }
    if (content_html !== undefined) { sets.push('content_html = ?'); values.push(content_html); }
    if (category_id !== undefined) { sets.push('category_id = ?'); values.push(category_id); }
    if (is_public !== undefined) { sets.push('is_public = ?'); values.push(is_public ? 1 : 0); }
    if (external_url !== undefined) { sets.push('external_url = ?'); values.push(external_url); }

    if (sets.length === 0) return this.getById(id);

    sets.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    await db.execute(`UPDATE resources SET ${sets.join(', ')} WHERE id = ?`, values);
    return this.getById(id);
  }

  static async delete(id, userId) {
    const resource = await this.getById(id);
    if (!resource || (resource.user_id !== userId)) return null;

    if (resource.file_path) {
      try {
        const fullPath = path.join(__dirname, '..', resource.file_path);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      } catch (e) { /* ignore */ }
    }

    await db.execute('DELETE FROM resources WHERE id = ?', [id]);
    return true;
  }

  static async adminDelete(id) {
    const resource = await this.getById(id);
    if (!resource) return null;

    if (resource.file_path) {
      try {
        const fullPath = path.join(__dirname, '..', resource.file_path);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      } catch (e) { /* ignore */ }
    }

    await db.execute('DELETE FROM resources WHERE id = ?', [id]);
    return true;
  }

  static async updateStatus(id, status) {
    await db.execute('UPDATE resources SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
    return this.getById(id);
  }

  static async countByStatus(status) {
    return db.queryOne('SELECT COUNT(*) as cnt FROM resources WHERE status = ?', [status]);
  }
}

module.exports = ResourceService;