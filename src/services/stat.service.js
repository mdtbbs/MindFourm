const db = require('../database');
const redis = require('../database/redis');

// SCAN helper for Redis (避免 KEYS 阻塞)
async function scanKeys(pattern) {
  return redis.scan(pattern, 100);
}

class StatService {
  static async getDashboardStats() {
    const totals = await db.queryOne(`
      SELECT
        (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL) as total_posts,
        (SELECT COUNT(*) FROM replies WHERE deleted_at IS NULL) as total_replies,
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND status = 'published' AND DATE(created_at) = CURDATE()) as today_posts,
        (SELECT COUNT(*) FROM replies WHERE deleted_at IS NULL AND DATE(created_at) = CURDATE()) as today_replies,
        (SELECT COUNT(*) FROM users WHERE DATE(created_at) = CURDATE()) as today_users
    `);

    // Get active users from Redis using SCAN (避免 KEYS 阻塞)
    const sessionKeys = await scanKeys('session:*');
    const active24h = sessionKeys.length;

    const activity7d = await db.query(`
      WITH dates(d) AS (
        SELECT CURDATE() - INTERVAL 6 DAY
        UNION ALL SELECT CURDATE() - INTERVAL 5 DAY
        UNION ALL SELECT CURDATE() - INTERVAL 4 DAY
        UNION ALL SELECT CURDATE() - INTERVAL 3 DAY
        UNION ALL SELECT CURDATE() - INTERVAL 2 DAY
        UNION ALL SELECT CURDATE() - INTERVAL 1 DAY
        UNION ALL SELECT CURDATE()
      ),
      pc AS (
        SELECT DATE(created_at) as d, COUNT(*) as cnt
        FROM posts WHERE deleted_at IS NULL AND status = 'published' AND created_at >= CURDATE() - INTERVAL 6 DAY
        GROUP BY DATE(created_at)
      )
      SELECT dates.d, COALESCE(pc.cnt, 0) as cnt FROM dates LEFT JOIN pc ON dates.d = pc.d ORDER BY dates.d
    `);

    return {
      total_posts: totals.total_posts,
      total_replies: totals.total_replies,
      total_users: totals.total_users,
      active_24h: active24h,
      today_posts: totals.today_posts,
      today_replies: totals.today_replies,
      today_users: totals.today_users,
      activity_7d: activity7d.map(r => r.cnt)
    };
  }
}

module.exports = StatService;