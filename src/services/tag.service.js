const db = require('../database');

class TagService {
  static getAll() {
    return db.prepare(`
      SELECT t.*, COUNT(pt.post_id) as post_count
      FROM tags t
      LEFT JOIN post_tags pt ON t.id = pt.tag_id
      LEFT JOIN posts p ON pt.post_id = p.id AND p.deleted_at IS NULL AND p.status = 'published'
      GROUP BY t.id
      ORDER BY post_count DESC, t.created_at DESC
    `).all();
  }

  static getBySlug(slug) {
    return db.prepare('SELECT * FROM tags WHERE slug = ?').get(slug);
  }

  static getOrCreate(name) {
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    let tag = this.getBySlug(slug);

    if (!tag) {
      const result = db.prepare('INSERT INTO tags (name, slug) VALUES (?, ?)').run(name, slug);
      tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
    }

    return tag;
  }

  static attachTags(postId, tags) {
    this.batchAttach(postId, tags);
  }

  static batchAttach(postId, tags) {
    if (!tags || !tags.length) return;
    const existing = db.prepare(`SELECT name, id FROM tags WHERE name IN (${tags.map(() => '?').join(',')})`).all(...tags);
    const existingMap = {};
    for (const t of existing) existingMap[t.name] = t.id;

    const missing = tags.filter(t => !existingMap[t]);
    const toCreate = [];
    for (const name of missing) {
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      toCreate.push([name, slug]);
    }

    if (toCreate.length) {
      const bulkInsert = db.prepare('INSERT OR IGNORE INTO tags (name, slug) VALUES (?, ?)');
      db.transaction(() => {
        for (const [name, slug] of toCreate) bulkInsert.run(name, slug);
      })();
      // Re-fetch newly created tags
      const newRows = db.prepare(`SELECT name, id FROM tags WHERE name IN (${missing.map(() => '?').join(',')})`).all(...missing);
      for (const t of newRows) existingMap[t.name] = t.id;
    }

    // Bulk insert post_tags
    const postTagRows = [];
    for (const name of tags) {
      const tagId = existingMap[name];
      if (tagId !== undefined) postTagRows.push([postId, tagId]);
    }
    if (postTagRows.length) {
      const bulkTag = db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)');
      db.transaction(() => {
        for (const [pid, tid] of postTagRows) bulkTag.run(pid, tid);
      })();
    }
  }

  static detachTags(postId) {
    db.prepare('DELETE FROM post_tags WHERE post_id = ?').run(postId);
  }

  static getPostTags(postId) {
    return db.prepare(`
      SELECT t.* FROM tags t
      JOIN post_tags pt ON t.id = pt.tag_id
      WHERE pt.post_id = ?
    `).all(postId);
  }

  static getPostTagsForMultiplePosts(postIds) {
    if (!postIds.length) return {};
    const rows = db.prepare(`
      SELECT pt.post_id, t.*
      FROM post_tags pt
      JOIN tags t ON pt.tag_id = t.id
      WHERE pt.post_id IN (${postIds.map(() => '?').join(',')})
      ORDER BY pt.post_id
    `).all(...postIds);

    const map = {};
    for (const row of rows) {
      if (!map[row.post_id]) map[row.post_id] = [];
      map[row.post_id].push(row);
    }
    return map;
  }

  static getPostsByTagSlug(slug, { page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;
    const tag = this.getBySlug(slug);

    if (!tag) return { data: [], pagination: { page, limit, total: 0, totalPages: 0 } };

    const posts = db.prepare(`
      SELECT p.*, c.name as category_name, u.mindauth_id as author_mindauth_id
      FROM posts p
      JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE pt.tag_id = ? AND p.deleted_at IS NULL AND p.status = 'published'
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `).all(tag.id, limit, offset);

    const countResult = db.prepare(`
      SELECT COUNT(*) as total
      FROM posts p
      JOIN post_tags pt ON p.id = pt.post_id
      WHERE pt.tag_id = ? AND p.deleted_at IS NULL AND p.status = 'published'
    `).get(tag.id);

    return {
      data: posts,
      pagination: {
        page,
        limit,
        total: countResult.total,
        totalPages: Math.ceil(countResult.total / limit)
      }
    };
  }
}

module.exports = TagService;