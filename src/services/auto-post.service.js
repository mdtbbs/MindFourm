const db = require('../database');

class AutoPostService {
  /**
   * 服务器审批通过后自动创建帖子
   * @param {object} data - { type, server_id, server_name, server_port, owner_id, owner_name, version }
   */
  static async createServerAnnouncement(data) {
    if (data.type !== 'server_approved') {
      return { success: false, message: '未知的自动发帖类型' };
    }

    // 查找 servers 分类（或使用默认分类）
    let category = db.prepare('SELECT id FROM categories WHERE slug = ?').get('servers');
    if (!category) {
      // 使用第一个分类作为 fallback
      category = db.prepare('SELECT id FROM categories WHERE is_active = 1 ORDER BY sort_order LIMIT 1').get();
    }

    if (!category) {
      return { success: false, message: '未找到合适的帖子分类' };
    }

    const title = `【服务器公告】${data.server_name} 已上线`;
    const content = `
用户 ${data.owner_name} 的服务器已通过审批！

**服务器信息：**
- 名称：${data.server_name}
- 版本：${data.version || '未知'}
- 地址：待分配

欢迎前来游玩！
    `.trim();

    const contentHtml = `
<p>用户 <strong>${data.owner_name}</strong> 的服务器已通过审批！</p>
<h3>服务器信息</h3>
<ul>
  <li>名称：${data.server_name}</li>
  <li>版本：${data.version || '未知'}</li>
  <li>地址：待分配</li>
</ul>
<p>欢迎前来游玩！</p>
    `.trim();

    try {
      const result = db.prepare(
        `INSERT INTO posts (user_id, category_id, title, content, content_html, status, server_id, post_type, created_at)
         VALUES (?, ?, ?, ?, ?, 'published', ?, 'server_announcement', CURRENT_TIMESTAMP)`
      ).run(
        data.owner_id,
        category.id,
        title,
        content,
        contentHtml,
        data.server_id,
      );

      return { success: true, post_id: result.lastInsertRowid };
    } catch (error) {
      console.error('Auto post error:', error);
      return { success: false, message: '发帖失败' };
    }
  }
}

module.exports = AutoPostService;