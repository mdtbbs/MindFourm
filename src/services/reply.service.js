const db = require('../database');
const { parseMarkdown } = require('../utils/markdown');
const { REPLY_STATUS } = require('../utils/constants');

class ReplyService {
  static create({ post_id, user_id, content, parent_reply_id = null }) {
    let finalContent = content;

    if (parent_reply_id) {
      const parentReply = this.getById(parent_reply_id);
      if (parentReply && parentReply.post_id === post_id) {
        finalContent = `> ${parentReply.content.split('\n')[0]}\n\n${content}`;
      }
    }

    const contentHtml = parseMarkdown(finalContent);

    const result = db.prepare(`
      INSERT INTO replies (post_id, user_id, parent_reply_id, content, content_html)
      VALUES (?, ?, ?, ?, ?)
    `).run(post_id, user_id, parent_reply_id, finalContent, contentHtml);

    return this.getById(result.lastInsertRowid);
  }

  static getById(id) {
    return db.prepare(`
      SELECT r.*, u.mindauth_id as author_mindauth_id, u.role as author_role
      FROM replies r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.id = ? AND r.deleted_at IS NULL
    `).get(id);
  }

  static getByPostId(postId, { page = 1, limit = 50 }) {
    const offset = (page - 1) * limit;

    const replies = db.prepare(`
      SELECT r.*, u.mindauth_id as author_mindauth_id, u.role as author_role
      FROM replies r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.post_id = ? AND r.deleted_at IS NULL
      ORDER BY r.created_at ASC
      LIMIT ? OFFSET ?
    `).all(postId, limit, offset);

    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM replies
      WHERE post_id = ? AND deleted_at IS NULL
    `).get(postId);

    return {
      data: replies,
      pagination: {
        page,
        limit,
        total: countResult.total,
        totalPages: Math.ceil(countResult.total / limit)
      }
    };
  }

  static update(id, content) {
    const contentHtml = parseMarkdown(content);
    db.prepare(`
      UPDATE replies SET content = ?, content_html = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(content, contentHtml, id);

    return this.getById(id);
  }

  static softDelete(id) {
    db.prepare(`
      UPDATE replies SET status = ?, deleted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(REPLY_STATUS.deleted, id);
  }
}

module.exports = ReplyService;