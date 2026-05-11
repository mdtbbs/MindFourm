const db = require('../database');
const { parseMarkdown } = require('../utils/markdown');
const { POST_STATUS } = require('../utils/constants');
const TagService = require('./tag.service');

class PostService {
  static create({ user_id, title, content, category_id, tags, status = POST_STATUS.draft }) {
    const contentHtml = parseMarkdown(content);

    const insertPost = db.prepare(`
      INSERT INTO posts (user_id, title, content, content_html, category_id, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = db.transaction(() => {
      const r = insertPost.run(user_id, title, content, contentHtml, category_id, status);
      const postId = r.lastInsertRowid;

      if (tags && tags.length > 0) {
        TagService.attachTags(postId, tags);
      }

      return postId;
    })();

    return this.getById(result);
  }

  static getById(id) {
    const post = db.prepare(`
      SELECT p.*, c.name as category_name, c.slug as category_slug,
             u.mindauth_id as author_mindauth_id, u.role as author_role
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.id = ? AND p.deleted_at IS NULL
    `).get(id);

    if (post) {
      post.tags = TagService.getPostTags(post.id);
    }

    return post;
  }

  static getList({ page = 1, limit = 20, category_id, status = POST_STATUS.published, user_id }) {
    const offset = (page - 1) * limit;
    const whereClauses = ['p.deleted_at IS NULL'];
    const params = [];

    if (category_id) {
      whereClauses.push('p.category_id = ?');
      params.push(category_id);
    }

    if (status) {
      whereClauses.push('p.status = ?');
      params.push(status);
    }

    if (user_id) {
      whereClauses.push('p.user_id = ?');
      params.push(user_id);
    }

    const whereClause = whereClauses.join(' AND ');

    const posts = db.prepare(`
      SELECT p.*, c.name as category_name,
             u.mindauth_id as author_mindauth_id, u.role as author_role
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE ${whereClause}
      ORDER BY p.is_pinned DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const countResult = db.prepare(`SELECT COUNT(*) as total FROM posts p WHERE ${whereClause}`).get(...params);

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

  static update(id, updates) {
    const fields = [];
    const values = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.content !== undefined) {
      fields.push('content = ?');
      fields.push('content_html = ?');
      values.push(updates.content);
      values.push(parseMarkdown(updates.content));
    }
    if (updates.category_id !== undefined) {
      fields.push('category_id = ?');
      values.push(updates.category_id);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.is_pinned !== undefined) {
      fields.push('is_pinned = ?');
      values.push(updates.is_pinned ? 1 : 0);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    db.transaction(() => {
      db.prepare(`UPDATE posts SET ${fields.join(', ')} WHERE id = ?`).run(...values);

      if (updates.tags !== undefined) {
        TagService.detachTags(id);
        if (updates.tags.length > 0) {
          TagService.attachTags(id, updates.tags);
        }
      }
    })();

    return this.getById(id);
  }

  static softDelete(id) {
    db.prepare(`
      UPDATE posts SET status = ?, deleted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(POST_STATUS.deleted, id);
  }

  static incrementViewCount(id) {
    db.prepare('UPDATE posts SET view_count = view_count + 1 WHERE id = ?').run(id);
  }

  static pin(id, isPinned) {
    db.prepare('UPDATE posts SET is_pinned = ? WHERE id = ?').run(isPinned ? 1 : 0, id);
    return this.getById(id);
  }

  static move(id, categoryId) {
    db.prepare('UPDATE posts SET category_id = ? WHERE id = ?').run(categoryId, id);
    return this.getById(id);
  }
}

module.exports = PostService;
