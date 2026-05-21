const db = require('../database');

class PostServerService {
  /**
   * 获取关联服务器的帖子列表
   * @param {number} serverId - 服务器ID
   */
  static getPostsByServer(serverId) {
    return db.all(`
      SELECT p.id, p.title, p.post_type, p.created_at, p.view_count,
             u.username as author_name, u.avatar_url as author_avatar
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.server_id = ? AND p.deleted_at IS NULL AND p.status = 'published'
      ORDER BY p.created_at DESC
      LIMIT 20
    `, [serverId]);
  }

  /**
   * 创建关联服务器的帖子
   * @param {object} data - 帖子数据 + server_id, post_type
   */
  static createPostWithServer(data) {
    const result = db.run(`
      INSERT INTO posts (user_id, category_id, title, content, content_html, status, server_id, post_type)
      VALUES (?, ?, ?, ?, ?, 'published', ?, ?)
    `, [
      data.user_id,
      data.category_id,
      data.title,
      data.content,
      data.content_html,
      data.server_id || null,
      data.post_type || 'normal',
    ]);

    return { success: true, post_id: result.lastInsertRowid };
  }
}

module.exports = PostServerService;