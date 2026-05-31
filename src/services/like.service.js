const db = require('../database');
const NotificationService = require('./notification.service');

class LikeService {
  // Post likes
  static async likePost(userId, postId) {
    try {
      // Check if already liked
      const existing = await this.isPostLiked(userId, postId);
      if (existing) return existing;

      // Add like
      await db.execute('INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)', [userId, postId]);

      // Update post like_count
      await db.execute('UPDATE posts SET like_count = like_count + 1 WHERE id = ?', [postId]);

      // Get post info for notification
      const post = await db.queryOne('SELECT user_id, title FROM posts WHERE id = ?', [postId]);

      // Create notification (if not self-like)
      if (post && post.user_id !== userId) {
        await NotificationService.create({
          user_id: post.user_id,
          type: 'post_like',
          actor_id: userId,
          post_id: postId,
          content: `点赞了你的帖子 "${post.title || '帖子'}"`
        });
      }

      return this.getPostLike(postId, userId);
    } catch (e) {
      if (e.message.includes('Duplicate') || e.code === 'ER_DUP_ENTRY') {
        return this.getPostLike(postId, userId);
      }
      throw e;
    }
  }

  static async unlikePost(userId, postId) {
    // Check if liked
    const existing = await this.isPostLiked(userId, postId);
    if (!existing) return;

    // Remove like
    await db.execute('DELETE FROM post_likes WHERE user_id = ? AND post_id = ?', [userId, postId]);

    // Update post like_count
    await db.execute('UPDATE posts SET like_count = GREATEST(0, like_count - 1) WHERE id = ?', [postId]);
  }

  static async isPostLiked(userId, postId) {
    return db.queryOne('SELECT * FROM post_likes WHERE user_id = ? AND post_id = ?', [userId, postId]);
  }

  static async getPostLike(postId, userId) {
    return db.queryOne('SELECT * FROM post_likes WHERE post_id = ? AND user_id = ?', [postId, userId]);
  }

  static async getPostLikeCount(postId) {
    const result = await db.queryOne('SELECT like_count FROM posts WHERE id = ?', [postId]);
    return result ? result.like_count : 0;
  }

  static async getUserLikedPosts(userId, { page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;

    const likes = await db.query(`
      SELECT pl.id, pl.created_at,
             p.id as post_id, p.title, p.status, p.like_count,
             c.name as category_name, c.id as category_id,
             u.mindauth_id as author_mindauth_id, u.role as author_role, u.username as author_name
      FROM post_likes pl
      JOIN posts p ON pl.post_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE pl.user_id = ? AND p.deleted_at IS NULL
      ORDER BY pl.created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, limit, offset]);

    const countResult = await db.queryOne(`
      SELECT COUNT(*) as total FROM post_likes pl
      JOIN posts p ON pl.post_id = p.id
      WHERE pl.user_id = ? AND p.deleted_at IS NULL
    `, [userId]);

    return {
      data: likes,
      pagination: {
        page,
        limit,
        total: countResult.total,
        totalPages: Math.ceil(countResult.total / limit)
      }
    };
  }

  // Reply likes
  static async likeReply(userId, replyId) {
    try {
      // Check if already liked
      const existing = await this.isReplyLiked(userId, replyId);
      if (existing) return existing;

      // Add like
      await db.execute('INSERT INTO reply_likes (user_id, reply_id) VALUES (?, ?)', [userId, replyId]);

      // Update reply like_count
      await db.execute('UPDATE replies SET like_count = like_count + 1 WHERE id = ?', [replyId]);

      // Get reply info for notification
      const reply = await db.queryOne('SELECT user_id, post_id FROM replies WHERE id = ?', [replyId]);

      // Create notification (if not self-like)
      if (reply && reply.user_id !== userId) {
        await NotificationService.create({
          user_id: reply.user_id,
          type: 'reply_like',
          actor_id: userId,
          reply_id: replyId,
          post_id: reply.post_id,
          content: '点赞了你的回复'
        });
      }

      return this.getReplyLike(replyId, userId);
    } catch (e) {
      if (e.message.includes('Duplicate') || e.code === 'ER_DUP_ENTRY') {
        return this.getReplyLike(replyId, userId);
      }
      throw e;
    }
  }

  static async unlikeReply(userId, replyId) {
    // Check if liked
    const existing = await this.isReplyLiked(userId, replyId);
    if (!existing) return;

    // Remove like
    await db.execute('DELETE FROM reply_likes WHERE user_id = ? AND reply_id = ?', [userId, replyId]);

    // Update reply like_count
    await db.execute('UPDATE replies SET like_count = GREATEST(0, like_count - 1) WHERE id = ?', [replyId]);
  }

  static async isReplyLiked(userId, replyId) {
    return db.queryOne('SELECT * FROM reply_likes WHERE user_id = ? AND reply_id = ?', [userId, replyId]);
  }

  static async getReplyLike(replyId, userId) {
    return db.queryOne('SELECT * FROM reply_likes WHERE reply_id = ? AND user_id = ?', [replyId, userId]);
  }

  static async getReplyLikeCount(replyId) {
    const result = await db.queryOne('SELECT like_count FROM replies WHERE id = ?', [replyId]);
    return result ? result.like_count : 0;
  }

  // User statistics
  static async getUserReceivedLikeCount(userId) {
    // Count likes received on user's posts and replies
    const postLikes = await db.queryOne(`
      SELECT COALESCE(SUM(p.like_count), 0) as total
      FROM posts p
      WHERE p.user_id = ? AND p.deleted_at IS NULL
    `, [userId]);

    const replyLikes = await db.queryOne(`
      SELECT COALESCE(SUM(r.like_count), 0) as total
      FROM replies r
      WHERE r.user_id = ? AND r.deleted_at IS NULL
    `, [userId]);

    return (postLikes?.total || 0) + (replyLikes?.total || 0);
  }
}

module.exports = LikeService;