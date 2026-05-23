const db = require('../database');
const redis = require('../database/redis');
const { NOTIFICATION_TYPES } = require('../utils/constants');
const { encodeCursor, decodeCursor } = require('../utils/cursor');
const EmailService = require('./email.service');
const SettingService = require('./setting.service');

class NotificationService {
  static async create({ user_id, type, actor_id, post_id, reply_id, content }) {
    if (user_id === actor_id) return null;

    const result = await db.execute(`
      INSERT INTO notifications (user_id, type, actor_id, post_id, reply_id, content)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [user_id, type, actor_id, post_id, reply_id, content]);

    // Invalidate unread count cache
    await redis.del(`unread:${user_id}`);

    return db.queryOne('SELECT * FROM notifications WHERE id = ?', [result.insertId]);
  }

  static async notifyPostAuthor(postId, { type, actor_id, reply_id, content }) {
    const post = await db.queryOne('SELECT user_id FROM posts WHERE id = ?', [postId]);
    if (!post) return null;

    const notification = await this.create({ user_id: post.user_id, type, actor_id, post_id: postId, reply_id, content });

    if (notification) {
      const author = await db.queryOne('SELECT email, username FROM users WHERE id = ?', [post.user_id]);
      if (author?.email) {
        const settings = await SettingService.getAll();
        const siteUrl = settings.site_url || 'http://localhost:3000';
        const actorName = (await db.queryOne('SELECT username FROM users WHERE id = ?', [actor_id]))?.username || '用户';
        const postTitle = (await db.queryOne('SELECT title FROM posts WHERE id = ?', [postId]))?.title || '';
        EmailService.send(author.email, 'reply', {
          actor_name: actorName,
          post_title: postTitle,
          post_url: `${siteUrl}/posts/${postId}`,
          content: content?.slice(0, 200),
        }).catch(() => {});
      }
    }

    return notification;
  }

  static async notifyMentionedUsers(content, postId, actorId, replyId, skipUserIds = []) {
    const mentions = content.match(/@([一-龥a-zA-Z0-9_]+)/g);
    if (!mentions) return [];

    const notifications = [];
    const seen = new Set(skipUserIds);

    for (const mention of mentions) {
      const username = mention.slice(1);
      const user = await db.queryOne('SELECT id, email FROM users WHERE username = ?', [username]);

      if (user && !seen.has(user.id)) {
        const notification = await this.create({
          user_id: user.id,
          type: NOTIFICATION_TYPES.mention,
          actor_id: actorId,
          post_id: postId,
          reply_id: replyId,
          content: content.slice(0, 200)
        });

        if (notification) {
          notifications.push(notification);
          const settings = await SettingService.getAll();
          const siteUrl = settings.site_url || 'http://localhost:3000';
          const actorName = (await db.queryOne('SELECT username FROM users WHERE id = ?', [actorId]))?.username || '用户';
          EmailService.send(user.email, 'mention', {
            actor_name: actorName,
            post_url: `${siteUrl}/posts/${postId}`,
            content: content.slice(0, 200),
          }).catch(() => {});
        }
        seen.add(user.id);
      }
    }
    return notifications;
  }

  static async getByUserId(userId, { page = 1, limit = 50 }) {
    const offset = (page - 1) * limit;

    const notifications = await db.query(`
      SELECT n.*, u.username as actor_name, u.avatar_url as actor_avatar,
             p.title as post_title
      FROM notifications n
      JOIN users u ON n.actor_id = u.id
      LEFT JOIN posts p ON n.post_id = p.id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, limit, offset]);

    const countResult = await db.queryOne(`
      SELECT COUNT(*) as total FROM notifications WHERE user_id = ?
    `, [userId]);

    return {
      data: notifications,
      pagination: {
        page, limit, total: countResult.total,
        totalPages: Math.ceil(countResult.total / limit)
      }
    };
  }

  // Cache unread count in Redis for 5 minutes
  static async getUnreadCount(userId) {
    const cacheKey = `unread:${userId}`;
    const cached = await redis.get(cacheKey);

    if (cached !== null) {
      return parseInt(cached, 10);
    }

    const result = await db.queryOne(`
      SELECT COUNT(*) as count FROM notifications
      WHERE user_id = ? AND is_read = 0
    `, [userId]);

    await redis.set(cacheKey, result.count.toString(), 300);
    return result.count;
  }

  static async markAsRead(notificationId, userId) {
    await db.execute(`
      UPDATE notifications SET is_read = 1
      WHERE id = ? AND user_id = ?
    `, [notificationId, userId]);

    // Invalidate cache
    await redis.del(`unread:${userId}`);
  }

  static async markAllAsRead(userId) {
    await db.execute(`
      UPDATE notifications SET is_read = 1
      WHERE user_id = ? AND is_read = 0
    `, [userId]);

    // Invalidate cache
    await redis.del(`unread:${userId}`);
  }

  static async getByUserIdCursor(userId, { limit = 50, cursor }) {
    const whereClauses = ['n.user_id = ?'];
    const params = [userId];

    if (cursor) {
      const [createdAt, id] = decodeCursor(cursor);
      whereClauses.push('(n.created_at < ? OR (n.created_at = ? AND n.id < ?))');
      params.push(createdAt, createdAt, parseInt(id));
    }

    const whereClause = whereClauses.join(' AND ');

    const notifications = await db.query(`
      SELECT n.*, u.username as actor_name, u.avatar_url as actor_avatar,
             p.title as post_title
      FROM notifications n
      JOIN users u ON n.actor_id = u.id
      LEFT JOIN posts p ON n.post_id = p.id
      WHERE ${whereClause}
      ORDER BY n.created_at DESC
      LIMIT ?
    `, [...params, limit + 1]);

    const hasMore = notifications.length > limit;
    if (hasMore) notifications.pop();

    const nextCursor = notifications.length > 0
      ? encodeCursor(notifications[notifications.length - 1].created_at, notifications[notifications.length - 1].id)
      : null;

    return { data: notifications, next_cursor: nextCursor, has_more: hasMore };
  }
}

module.exports = NotificationService;