const db = require('../database');
const redis = require('../database/redis');
const { parseMarkdown } = require('../utils/markdown');
const { encodeCursor, decodeCursor } = require('../utils/cursor');
const NotificationService = require('./notification.service');
const { NOTIFICATION_TYPES } = require('../utils/constants');

class MessageService {
  static async create({ sender_id, recipient_id, content }) {
    if (sender_id === recipient_id) return null;

    const contentHtml = parseMarkdown(content);
    const result = await db.execute(`
      INSERT INTO messages (sender_id, recipient_id, content, content_html)
      VALUES (?, ?, ?, ?)
    `, [sender_id, recipient_id, content, contentHtml]);

    const message = await this.getById(result.insertId);

    // Notify recipient
    await NotificationService.create({
      user_id: recipient_id,
      type: NOTIFICATION_TYPES.message,
      actor_id: sender_id,
      post_id: null,
      reply_id: null,
      content: content.slice(0, 200),
    });

    // Invalidate unread count cache for recipient
    await redis.del(`unread_msg:${recipient_id}`);

    return message;
  }

  static async getById(id) {
    return db.queryOne(`
      SELECT m.*, s.username as sender_name, s.avatar_url as sender_avatar,
             r.username as recipient_name
      FROM messages m
      JOIN users s ON m.sender_id = s.id
      JOIN users r ON m.recipient_id = r.id
      WHERE m.id = ?
    `, [id]);
  }

  static async getConversations(userId, { limit = 20, cursor }) {
    const whereClauses = [];
    const params = [userId];

    if (cursor) {
      const [createdAt, id] = decodeCursor(cursor);
      whereClauses.push('(last_at < ? OR (last_at = ? AND last_id < ?))');
      params.push(createdAt, createdAt, parseInt(id));
    }

    const whereClause = whereClauses.length > 0 ? `AND ${whereClauses.join(' AND ')}` : '';

    const conversations = await db.query(`
      WITH latest AS (
        SELECT
          CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END as other_user_id,
          MAX(created_at) as last_at,
          MAX(id) as last_id
        FROM messages
        WHERE (sender_id = ? AND deleted_by_sender = 0)
           OR (recipient_id = ? AND deleted_by_recipient = 0)
        GROUP BY other_user_id
        ${whereClause}
      )
      SELECT
        l.other_user_id as user_id,
        u.username,
        u.avatar_url,
        (SELECT COUNT(*) FROM messages WHERE recipient_id = ? AND sender_id = l.other_user_id AND is_read = 0 AND deleted_by_recipient = 0) as unread_count,
        l.last_at,
        l.last_id as last_message_id,
        (SELECT content FROM messages WHERE id = l.last_id) as last_content
      FROM latest l
      JOIN users u ON u.id = l.other_user_id
      ORDER BY l.last_at DESC
      LIMIT ?
    `, [userId, userId, userId, userId, limit + 1]);

    const hasMore = conversations.length > limit;
    if (hasMore) conversations.pop();

    const nextCursor = conversations.length > 0
      ? encodeCursor(conversations[conversations.length - 1].last_at, conversations[conversations.length - 1].last_message_id)
      : null;

    return { data: conversations, next_cursor: nextCursor, has_more: hasMore };
  }

  static async getConversation(userId, otherUserId, { limit = 50, cursor }) {
    const whereClauses = [
      '((sender_id = ? AND recipient_id = ? AND deleted_by_sender = 0) OR (sender_id = ? AND recipient_id = ? AND deleted_by_recipient = 0))',
    ];
    const params = [userId, otherUserId, otherUserId, userId];

    if (cursor) {
      const [createdAt, id] = decodeCursor(cursor);
      whereClauses.push('(m.created_at < ? OR (m.created_at = ? AND m.id < ?))');
      params.push(createdAt, createdAt, parseInt(id));
    }

    // Mark messages as read
    await db.execute(`
      UPDATE messages SET is_read = 1, read_at = CURRENT_TIMESTAMP
      WHERE sender_id = ? AND recipient_id = ? AND is_read = 0
    `, [otherUserId, userId]);

    // Invalidate unread count cache
    await redis.del(`unread_msg:${userId}`);

    const whereClause = whereClauses.join(' AND ');

    const messages = await db.query(`
      SELECT m.*, s.username as sender_name, s.avatar_url as sender_avatar
      FROM messages m
      JOIN users s ON m.sender_id = s.id
      WHERE ${whereClause}
      ORDER BY m.created_at DESC
      LIMIT ?
    `, [...params, limit + 1]);

    messages.reverse();

    const hasMore = messages.length > limit;
    if (hasMore) messages.shift();

    const nextCursor = messages.length > 0
      ? encodeCursor(messages[0].created_at, messages[0].id)
      : null;

    return { data: messages, next_cursor: nextCursor, has_more: hasMore };
  }

  static async markAsRead(messageId, userId) {
    await db.execute(`
      UPDATE messages SET is_read = 1, read_at = CURRENT_TIMESTAMP
      WHERE id = ? AND recipient_id = ?
    `, [messageId, userId]);

    await redis.del(`unread_msg:${userId}`);
  }

  // Cache unread count in Redis for 5 minutes
  static async getUnreadCount(userId) {
    const cacheKey = `unread_msg:${userId}`;
    const cached = await redis.get(cacheKey);

    if (cached !== null) {
      return parseInt(cached, 10);
    }

    const result = await db.queryOne(`
      SELECT COUNT(*) as count FROM messages
      WHERE recipient_id = ? AND is_read = 0 AND deleted_by_recipient = 0
    `, [userId]);

    await redis.set(cacheKey, result.count.toString(), 300);
    return result.count;
  }

  static async deleteForUser(messageId, userId, isSender) {
    const column = isSender ? 'deleted_by_sender' : 'deleted_by_recipient';
    await db.execute(`UPDATE messages SET ${column} = 1 WHERE id = ?`, [messageId]);

    const msg = await db.queryOne('SELECT deleted_by_sender, deleted_by_recipient FROM messages WHERE id = ?', [messageId]);
    if (msg?.deleted_by_sender && msg?.deleted_by_recipient) {
      await db.execute('DELETE FROM messages WHERE id = ?', [messageId]);
    }
  }
}

module.exports = MessageService;