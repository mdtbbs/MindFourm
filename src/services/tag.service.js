const db = require('../database');

class TagService {
  static async getAll() {
    return db.query(`
      SELECT t.*, COUNT(pt.post_id) as post_count
      FROM tags t
      LEFT JOIN post_tags pt ON t.id = pt.tag_id
      LEFT JOIN posts p ON pt.post_id = p.id AND p.deleted_at IS NULL AND p.status = 'published'
      GROUP BY t.id
      ORDER BY post_count DESC, t.created_at DESC
    `);
  }

  static async getBySlug(slug) {
    return db.queryOne('SELECT * FROM tags WHERE slug = ?', [slug]);
  }

  static async getOrCreate(name) {
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    let tag = await this.getBySlug(slug);

    if (!tag) {
      const result = await db.execute('INSERT INTO tags (name, slug) VALUES (?, ?)', [name, slug]);
      tag = await db.queryOne('SELECT * FROM tags WHERE id = ?', [result.insertId]);
    }

    return tag;
  }

  static async attachTags(postId, tags) {
    await this.batchAttach(postId, tags);
  }

  static async batchAttach(postId, tags) {
    if (!tags || !tags.length) return;

    const existing = await db.query(
      `SELECT name, id FROM tags WHERE name IN (${tags.map(() => '?').join(',')})`,
      tags
    );
    const existingMap = {};
    for (const t of existing) existingMap[t.name] = t.id;

    const missing = tags.filter(t => !existingMap[t]);

    // 批量插入缺失标签
    if (missing.length > 0) {
      const values = missing.map(name => {
        const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        return `('${name.replace(/'/g, "''")}', '${slug}')`;
      }).join(',');
      await db.execute(`INSERT IGNORE INTO tags (name, slug) VALUES ${values}`);

      // 获取新插入标签的 ID
      const newTags = await db.query(
        `SELECT name, id FROM tags WHERE name IN (${missing.map(() => '?').join(',')})`,
        missing
      );
      for (const t of newTags) existingMap[t.name] = t.id;
    }

    // 批量插入 post_tags 关联
    const tagIds = tags.map(name => existingMap[name]).filter(id => id !== undefined);
    if (tagIds.length > 0) {
      const postTagValues = tagIds.map(tagId => `(${postId}, ${tagId})`).join(',');
      await db.execute(`INSERT IGNORE INTO post_tags (post_id, tag_id) VALUES ${postTagValues}`);
    }
  }

  static async detachTags(postId) {
    await db.execute('DELETE FROM post_tags WHERE post_id = ?', [postId]);
  }

  static async getPostTags(postId) {
    return db.query(`
      SELECT t.* FROM tags t
      JOIN post_tags pt ON t.id = pt.tag_id
      WHERE pt.post_id = ?
    `, [postId]);
  }

  static async getPostTagsForMultiplePosts(postIds) {
    if (!postIds.length) return {};

    const rows = await db.query(`
      SELECT pt.post_id, t.*
      FROM post_tags pt
      JOIN tags t ON pt.tag_id = t.id
      WHERE pt.post_id IN (${postIds.map(() => '?').join(',')})
      ORDER BY pt.post_id
    `, postIds);

    const map = {};
    for (const row of rows) {
      if (!map[row.post_id]) map[row.post_id] = [];
      map[row.post_id].push(row);
    }
    return map;
  }

  static async getPostsByTagSlug(slug, { page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;
    const tag = await this.getBySlug(slug);

    if (!tag) return { data: [], pagination: { page, limit, total: 0, totalPages: 0 } };

    const posts = await db.query(`
      SELECT p.*, c.name as category_name, u.mindauth_id as author_mindauth_id
      FROM posts p
      JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE pt.tag_id = ? AND p.deleted_at IS NULL AND p.status = 'published'
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [tag.id, limit, offset]);

    const countResult = await db.queryOne(`
      SELECT COUNT(*) as total
      FROM posts p
      JOIN post_tags pt ON p.id = pt.post_id
      WHERE pt.tag_id = ? AND p.deleted_at IS NULL AND p.status = 'published'
    `, [tag.id]);

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