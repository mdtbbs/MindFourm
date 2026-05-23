const db = require('../database');

class BookmarkService {
  static async add(userId, postId) {
    try {
      await db.execute('INSERT INTO bookmarks (user_id, post_id) VALUES (?, ?)', [userId, postId]);
    } catch (e) {
      if (e.message.includes('Duplicate') || e.code === 'ER_DUP_ENTRY') {
        return this.getByUserAndPost(userId, postId);
      }
      throw e;
    }
    return this.getByUserAndPost(userId, postId);
  }

  static async remove(userId, postId) {
    await db.execute('DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?', [userId, postId]);
  }

  static async getByUserAndPost(userId, postId) {
    return db.queryOne('SELECT * FROM bookmarks WHERE user_id = ? AND post_id = ?', [userId, postId]);
  }

  static async getByUserId(userId, { page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;

    const bookmarks = await db.query(`
      SELECT b.id, b.created_at,
             p.id as post_id, p.title, p.status,
             c.name as category_name, c.id as category_id,
             u.mindauth_id as author_mindauth_id, u.role as author_role
      FROM bookmarks b
      JOIN posts p ON b.post_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE b.user_id = ? AND p.deleted_at IS NULL
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, limit, offset]);

    const countResult = await db.queryOne(`
      SELECT COUNT(*) as total FROM bookmarks b
      JOIN posts p ON b.post_id = p.id
      WHERE b.user_id = ? AND p.deleted_at IS NULL
    `, [userId]);

    return {
      data: bookmarks,
      pagination: {
        page,
        limit,
        total: countResult.total,
        totalPages: Math.ceil(countResult.total / limit)
      }
    };
  }
}

module.exports = BookmarkService;