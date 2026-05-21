const db = require('../database');
const { NOTIFICATION_TYPES } = require('../utils/constants');
const { encodeCursor, decodeCursor } = require('../utils/cursor');
const EmailService = require('./email.service');
const SettingService = require('./setting.service');

class NotificationService {
  static create({ user_id, type, actor_id, post_id, reply_id, content }) {
    // Don't notify yourself
    if (user_id === actor_id) return null;

    const result = db.prepare(`
      INSERT INTO notifications (user_id, type, actor_id, post_id, reply_id, content)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(user_id, type, actor_id, post_id, reply_id, content);

    return db.prepare('SELECT * FROM notifications WHERE id = ?').get(result.lastInsertRowid);
  }

  static notifyPostAuthor(postId, { type, actor_id, reply_id, content }) {
    const post = db.prepare('SELECT user_id FROM posts WHERE id = ?').get(postId);
    if (!post) return null;
    const notification = this.create({ user_id: post.user_id, type, actor_id, post_id: postId, reply_id, content });

    // Send email notification for reply
    if (notification) {
      const author = db.prepare('SELECT email, username FROM users WHERE id = ?').get(post.user_id);
      if (author?.email) {
        const settings = SettingService.getAll();
        const siteUrl = settings.site_url || 'http://localhost:3000';
        EmailService.send(author.email, 'reply', {
          actor_name: db.prepare('SELECT username FROM users WHERE id = ?').get(actor_id)?.username || '用户',
          post_title: db.prepare('SELECT title FROM posts WHERE id = ?').get(postId)?.title || '',
          post_url: `${siteUrl}/posts/${postId}`,
          content: content?.slice(0, 200),
        }).catch(() => {});
      }
    }

    return notification;
  }

  static notifyMentionedUsers(content, postId, actorId, replyId, skipUserIds = []) {
    // Extract @username mentions (alphanumeric, underscore, Chinese characters)
    const mentions = content.match(/@([一-龥a-zA-Z0-9_]+)/g);
    if (!mentions) return [];

    const notifications = [];
    const seen = new Set(skipUserIds);
    for (const mention of mentions) {
      const username = mention.slice(1);
      const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (user && !seen.has(user.id)) {
        const notification = this.create({
          user_id: user.id,
          type: NOTIFICATION_TYPES.mention,
          actor_id: actorId,
          post_id: postId,
          reply_id: replyId,
          content: content.slice(0, 200)
        });
        if (notification) {
          notifications.push(notification);
          // Send email notification for mention
          const settings = SettingService.getAll();
          const siteUrl = settings.site_url || 'http://localhost:3000';
          EmailService.send(user.email, 'mention', {
            actor_name: db.prepare('SELECT username FROM users WHERE id = ?').get(actorId)?.username || '用户',
            post_url: `${siteUrl}/posts/${postId}`,
            content: content.slice(0, 200),
          }).catch(() => {});
        }
        seen.add(user.id);
      }
    }
    return notifications;
  }

  static getByUserId(userId, { page = 1, limit = 50 }) {
    const offset = (page - 1) * limit;

    const notifications = db.prepare(`
      SELECT n.*, u.username as actor_name, u.avatar_url as actor_avatar,
             p.title as post_title
      FROM notifications n
      JOIN users u ON n.actor_id = u.id
      LEFT JOIN posts p ON n.post_id = p.id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, limit, offset);

    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM notifications WHERE user_id = ?
    `).get(userId);

    return {
      data: notifications,
      pagination: {
        page, limit, total: countResult.total,
        totalPages: Math.ceil(countResult.total / limit)
      }
    };
  }

  static getUnreadCount(userId) {
    return db.prepare(`
      SELECT COUNT(*) as count FROM notifications
      WHERE user_id = ? AND is_read = 0
    `).get(userId).count;
  }

  static markAsRead(notificationId, userId) {
    db.prepare(`
      UPDATE notifications SET is_read = 1
      WHERE id = ? AND user_id = ?
    `).run(notificationId, userId);
  }

  static markAllAsRead(userId) {
    db.prepare(`
      UPDATE notifications SET is_read = 1
      WHERE user_id = ? AND is_read = 0
    `).run(userId);
  }

  static getByUserIdCursor(userId, { limit = 50, cursor }) {
    const whereClauses = ['n.user_id = ?'];
    const params = [userId];

    if (cursor) {
      const [createdAt, id] = decodeCursor(cursor);
      whereClauses.push('(n.created_at < ? OR (n.created_at = ? AND n.id < ?))');
      params.push(createdAt, createdAt, parseInt(id));
    }

    const whereClause = whereClauses.join(' AND ');

    const notifications = db.prepare(`
      SELECT n.*, u.username as actor_name, u.avatar_url as actor_avatar,
             p.title as post_title
      FROM notifications n
      JOIN users u ON n.actor_id = u.id
      LEFT JOIN posts p ON n.post_id = p.id
      WHERE ${whereClause}
      ORDER BY n.created_at DESC
      LIMIT ?
    `).all(...params, limit + 1);

    const hasMore = notifications.length > limit;
    if (hasMore) notifications.pop();

    const nextCursor = notifications.length > 0
      ? encodeCursor(notifications[notifications.length - 1].created_at, notifications[notifications.length - 1].id)
      : null;

    return { data: notifications, next_cursor: nextCursor, has_more: hasMore };
  }
}

module.exports = NotificationService;
