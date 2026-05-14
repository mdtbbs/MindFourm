const db = require('../database');
const { NOTIFICATION_TYPES } = require('../utils/constants');

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
    return this.create({ user_id: post.user_id, type, actor_id, post_id: postId, reply_id, content });
  }

  static notifyMentionedUsers(content, postId, actorId, replyId, skipUserIds = []) {
    // Extract @username mentions
    const mentions = content.match(/@(\w+)/g);
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
        if (notification) notifications.push(notification);
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
}

module.exports = NotificationService;
