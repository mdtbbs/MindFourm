const db = require('../database');

class StatService {
  static getDashboardStats() {
    const totals = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL) as total_posts,
        (SELECT COUNT(*) FROM replies WHERE deleted_at IS NULL) as total_replies,
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND status = 'published' AND date(created_at) = date('now')) as today_posts,
        (SELECT COUNT(*) FROM replies WHERE deleted_at IS NULL AND date(created_at) = date('now')) as today_replies,
        (SELECT COUNT(*) FROM users WHERE date(created_at) = date('now')) as today_users
    `).get();

    const active24h = db.prepare(`
      SELECT COUNT(DISTINCT s.user_id) as count
      FROM sessions s
      WHERE s.expires_at > datetime('now', '-24 hours')
    `).get();

    const activity7d = db.prepare(`
      WITH dates(d) AS (
        SELECT date('now', '-6 days') UNION ALL SELECT date('now', '-5 days') UNION ALL
        SELECT date('now', '-4 days') UNION ALL SELECT date('now', '-3 days') UNION ALL
        SELECT date('now', '-2 days') UNION ALL SELECT date('now', '-1 day') UNION ALL
        SELECT date('now')
      ),
      pc AS (
        SELECT date(created_at) as d, COUNT(*) as cnt
        FROM posts WHERE deleted_at IS NULL AND status = 'published' AND created_at >= date('now', '-6 days')
        GROUP BY date(created_at)
      )
      SELECT dates.d, COALESCE(pc.cnt, 0) as cnt FROM dates LEFT JOIN pc ON dates.d = pc.d ORDER BY dates.d
    `).all();

    return {
      total_posts: totals.total_posts,
      total_replies: totals.total_replies,
      total_users: totals.total_users,
      active_24h: active24h.count,
      today_posts: totals.today_posts,
      today_replies: totals.today_replies,
      today_users: totals.today_users,
      activity_7d: activity7d.map(r => r.cnt)
    };
  }
}

module.exports = StatService;
