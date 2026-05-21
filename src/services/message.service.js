const db = require('../database');
const { parseMarkdown } = require('../utils/markdown');
const { encodeCursor, decodeCursor } = require('../utils/cursor');
const NotificationService = require('./notification.service');
const { NOTIFICATION_TYPES } = require('../utils/constants');

class MessageService {
  static create({ sender_id, recipient_id, content }) {
    if (sender_id === recipient_id) return null;

    const contentHtml = parseMarkdown(content);
    const result = db.prepare(`
      INSERT INTO messages (sender_id, recipient_id, content, content_html)
      VALUES (?, ?, ?, ?)
    `).run(sender_id, recipient_id, content, contentHtml);

    const message = this.getById(result.lastInsertRowid);

    // Notify recipient
    NotificationService.create({
      user_id: recipient_id,
      type: NOTIFICATION_TYPES.message,
      actor_id: sender_id,
      post_id: null,
      reply_id: null,
      content: content.slice(0, 200),
    });

    return message;
  }

  static getById(id) {
    return db.prepare(`
      SELECT m.*, s.username as sender_name, s.avatar_url as sender_avatar,
             r.username as recipient_name
      FROM messages m
      JOIN users s ON m.sender_id = s.id
      JOIN users r ON m.recipient_id = r.id
      WHERE m.id = ?
    `).get(id);
  }

  static getConversations(userId, { limit = 20, cursor }) {
    const whereClauses = [];
    const params = [userId];

    if (cursor) {
      const [createdAt, id] = decodeCursor(cursor);
      whereClauses.push('(last_at < ? OR (last_at = ? AND last_id < ?))');
      params.push(createdAt, createdAt, parseInt(id));
    }

    const whereClause = whereClauses.length > 0 ? `AND ${whereClauses.join(' AND ')}` : '';

    const conversations = db.prepare(`
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
    `).all(userId, userId, userId, userId, limit + 1);

    const hasMore = conversations.length > limit;
    if (hasMore) conversations.pop();

    const nextCursor = conversations.length > 0
      ? encodeCursor(conversations[conversations.length - 1].last_at, conversations[conversations.length - 1].last_message_id)
      : null;

    return { data: conversations, next_cursor: nextCursor, has_more: hasMore };
  }

  static getConversation(userId, otherUserId, { limit = 50, cursor }) {
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
    db.prepare(`
      UPDATE messages SET is_read = 1, read_at = CURRENT_TIMESTAMP
      WHERE sender_id = ? AND recipient_id = ? AND is_read = 0
    `).run(otherUserId, userId);

    const whereClause = whereClauses.join(' AND ');

    const messages = db.prepare(`
      SELECT m.*, s.username as sender_name, s.avatar_url as sender_avatar
      FROM messages m
      JOIN users s ON m.sender_id = s.id
      WHERE ${whereClause}
      ORDER BY m.created_at DESC
      LIMIT ?
    `).all(...params, limit + 1);

    messages.reverse(); // Oldest first

    const hasMore = messages.length > limit;
    if (hasMore) messages.shift();

    const nextCursor = messages.length > 0
      ? encodeCursor(messages[0].created_at, messages[0].id)
      : null;

    return { data: messages, next_cursor: nextCursor, has_more: hasMore };
  }

  static markAsRead(messageId, userId) {
    db.prepare(`
      UPDATE messages SET is_read = 1, read_at = CURRENT_TIMESTAMP
      WHERE id = ? AND recipient_id = ?
    `).run(messageId, userId);
  }

  static getUnreadCount(userId) {
    return db.prepare(`
      SELECT COUNT(*) as count FROM messages
      WHERE recipient_id = ? AND is_read = 0 AND deleted_by_recipient = 0
    `).get(userId).count;
  }

  static deleteForUser(messageId, userId, isSender) {
    const column = isSender ? 'deleted_by_sender' : 'deleted_by_recipient';
    db.prepare(`UPDATE messages SET ${column} = 1 WHERE id = ?`).run(messageId);

    // If both deleted, hard delete
    const msg = db.prepare('SELECT deleted_by_sender, deleted_by_recipient FROM messages WHERE id = ?').get(messageId);
    if (msg?.deleted_by_sender && msg?.deleted_by_recipient) {
      db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
    }
  }
}

module.exports = MessageService;
