const db = require('../database');
const { parseMarkdown } = require('../utils/markdown');
const { REPLY_STATUS, NOTIFICATION_TYPES } = require('../utils/constants');
const NotificationService = require('./notification.service');

class ReplyService {
  /**
   * 创建回复并验证帖子（合并查询优化）
   */
  static async createWithValidation({ post_id, user_id, content, parent_reply_id = null }) {
    let finalContent = content;

    // 处理引用回复
    if (parent_reply_id) {
      const parentReply = await this.getById(parent_reply_id);
      if (parentReply && parentReply.post_id === post_id) {
        finalContent = `> ${parentReply.content.split('\n')[0]}\n\n${content}`;
      }
    }

    const contentHtml = parseMarkdown(finalContent);

    // 在事务中验证帖子并创建回复（合并查询）
    const result = await db.transaction(async (conn) => {
      // 验证帖子存在且已发布（一次查询）
      const [postRows] = await conn.execute(`
        SELECT id FROM posts WHERE id = ? AND status = 'published' AND deleted_at IS NULL
      `, [post_id]);

      if (postRows.length === 0) {
        return null; // 帖子不存在或未发布
      }

      // 创建回复
      const [r] = await conn.execute(`
        INSERT INTO replies (post_id, user_id, parent_reply_id, content, content_html)
        VALUES (?, ?, ?, ?, ?)
      `, [post_id, user_id, parent_reply_id, finalContent, contentHtml]);

      return r.insertId;
    });

    if (!result) return null;

    const reply = await this.getById(result);

    // 通知（异步执行，不阻塞）
    NotificationService.notifyPostAuthor(post_id, {
      type: NOTIFICATION_TYPES.reply,
      actor_id: user_id,
      reply_id: result,
      content: content.slice(0, 200)
    }).then(postAuthor => {
      const skipUserIds = postAuthor ? [postAuthor.user_id] : [];
      return NotificationService.notifyMentionedUsers(content, post_id, user_id, result, skipUserIds);
    }).catch(() => {});

    return reply;
  }

  static async create({ post_id, user_id, content, parent_reply_id = null }) {
    let finalContent = content;

    if (parent_reply_id) {
      const parentReply = await this.getById(parent_reply_id);
      if (parentReply && parentReply.post_id === post_id) {
        finalContent = `> ${parentReply.content.split('\n')[0]}\n\n${content}`;
      }
    }

    const contentHtml = parseMarkdown(finalContent);

    const result = await db.transaction(async (conn) => {
      const [r] = await conn.execute(`
        INSERT INTO replies (post_id, user_id, parent_reply_id, content, content_html)
        VALUES (?, ?, ?, ?, ?)
      `, [post_id, user_id, parent_reply_id, finalContent, contentHtml]);
      return r.insertId;
    });

    const reply = await this.getById(result);

    // Notify post author
    const postAuthor = await NotificationService.notifyPostAuthor(post_id, {
      type: NOTIFICATION_TYPES.reply,
      actor_id: user_id,
      reply_id: result,
      content: content.slice(0, 200)
    });

    // Notify @mentioned users
    const skipUserIds = postAuthor ? [postAuthor.user_id] : [];
    await NotificationService.notifyMentionedUsers(content, post_id, user_id, result, skipUserIds);

    return reply;
  }

  static async getById(id) {
    return db.queryOne(`
      SELECT r.*, u.mindauth_id as author_mindauth_id, u.role as author_role
      FROM replies r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.id = ? AND r.deleted_at IS NULL
    `, [id]);
  }

  static async getByPostId(postId, { page = 1, limit = 50 }) {
    const offset = (page - 1) * limit;

    const replies = await db.query(`
      SELECT r.*, u.mindauth_id as author_mindauth_id, u.role as author_role
      FROM replies r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.post_id = ? AND r.deleted_at IS NULL
      ORDER BY r.created_at ASC
      LIMIT ? OFFSET ?
    `, [postId, limit, offset]);

    const countResult = await db.queryOne(`
      SELECT COUNT(*) as total FROM replies
      WHERE post_id = ? AND deleted_at IS NULL
    `, [postId]);

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

  static async update(id, content) {
    const contentHtml = parseMarkdown(content);
    await db.execute(`
      UPDATE replies SET content = ?, content_html = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [content, contentHtml, id]);

    return this.getById(id);
  }

  static async softDelete(id) {
    await db.execute(`
      UPDATE replies SET status = ?, deleted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [REPLY_STATUS.deleted, id]);
  }
}

module.exports = ReplyService;