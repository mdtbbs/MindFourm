const db = require('../database');
const Response = require('../utils/response');
const CategoryService = require('../services/category.service');
const PostService = require('../services/post.service');
const UserService = require('../services/user.service');
const LogService = require('../services/log.service');
const SettingService = require('../services/setting.service');
const StatService = require('../services/stat.service');
const BanService = require('../services/ban.service');
const TagService = require('../services/tag.service');
const { LOG_ACTIONS } = require('../utils/constants');

class AdminController {
  static async createCategory(ctx) {
    const user = ctx.state.user;
    const { name, slug, sort_order } = ctx.request.body;
    const category = await CategoryService.create({ name, slug, sort_order: parseInt(sort_order) || 0 });
    await LogService.log({ user_id: user.id, action: LOG_ACTIONS.CATEGORY_CREATE, target_type: 'category', target_id: category.id, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.created(ctx, category);
  }

  static async updateCategory(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const { name, slug, sort_order, is_active } = ctx.request.body;
    const category = await CategoryService.update(parseInt(id), { name, slug, sort_order: parseInt(sort_order) || undefined, is_active: parseInt(is_active) || undefined });
    await LogService.log({ user_id: user.id, action: LOG_ACTIONS.CATEGORY_EDIT, target_type: 'category', target_id: category.id, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, category);
  }

  static async deleteCategory(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    await CategoryService.delete(parseInt(id));
    await LogService.log({ user_id: user.id, action: LOG_ACTIONS.CATEGORY_DELETE, target_type: 'category', target_id: parseInt(id), ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: 'Category deleted' });
  }

  static async updateUserRole(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const { role } = ctx.request.body;
    if (!['guest', 'user', 'moderator', 'admin'].includes(role)) { Response.error(ctx, 'Invalid role', 400); return; }
    const targetUser = await UserService.getById(parseInt(id));
    if (!targetUser) { Response.notFound(ctx, 'User not found'); return; }
    const updatedUser = await UserService.updateRole(parseInt(id), role);
    await LogService.log({ user_id: user.id, action: LOG_ACTIONS.USER_ROLE_CHANGE, target_type: 'user', target_id: parseInt(id), details: { old_role: targetUser.role, new_role: role }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, updatedUser);
  }

  static async pinPost(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const { is_pinned } = ctx.request.body;
    const post = await PostService.pin(parseInt(id), is_pinned);
    if (!post) { Response.notFound(ctx, 'Post not found'); return; }
    await LogService.log({ user_id: user.id, action: LOG_ACTIONS.POST_PIN, target_type: 'post', target_id: post.id, details: { is_pinned }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, post);
  }

  static async movePost(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const { category_id } = ctx.request.body;
    const category = await CategoryService.getById(parseInt(category_id));
    if (!category) { Response.notFound(ctx, 'Target category not found'); return; }
    const post = await PostService.move(parseInt(id), parseInt(category_id));
    if (!post) { Response.notFound(ctx, 'Post not found'); return; }
    await LogService.log({ user_id: user.id, action: LOG_ACTIONS.POST_MOVE, target_type: 'post', target_id: post.id, details: { old_category_id: post.category_id, new_category_id: category_id }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, post);
  }

  static async getLogs(ctx) {
    const { page, limit, user_id, action, target_type } = ctx.query;
    const result = await LogService.getLogs({ page: parseInt(page) || 1, limit: parseInt(limit) || 50, user_id: parseInt(user_id) || null, action: action || null, target_type: target_type || null });
    Response.paginated(ctx, result.data, result.pagination);
  }

  static async getStats(ctx) {
    const stats = await StatService.getDashboardStats();
    Response.success(ctx, stats);
  }

  static async getBadgeCounts(ctx) {
    const moderationResult = await db.queryOne(`
      SELECT (SELECT COUNT(*) FROM posts WHERE status = 'pending') + (SELECT COUNT(*) FROM replies WHERE status = 'pending') as total
    `);
    const announceActive = (await SettingService.get('announce_enabled')) === 'true' ? 1 : 0;
    Response.success(ctx, { moderation_pending: moderationResult.total, announce_active: announceActive });
  }

  static async getSettings(ctx) {
    const { category } = ctx.params;
    if (category) {
      Response.success(ctx, await SettingService.getByCategory(category));
    } else {
      Response.success(ctx, await SettingService.getAll());
    }
  }

  static async updateSettings(ctx) {
    const user = ctx.state.user;
    const { category } = ctx.params;
    const updates = ctx.request.body;
    const result = await SettingService.setBatch(category, updates);
    await LogService.log({ user_id: user.id, action: LOG_ACTIONS.SETTINGS_UPDATE, target_type: 'settings', target_id: category, details: { keys: Object.keys(updates) }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, result);
  }

  static async getUsers(ctx) {
    const { page, limit, search } = ctx.query;
    const result = await UserService.getAll({ page: parseInt(page) || 1, limit: parseInt(limit) || 20, search: search || null });
    Response.paginated(ctx, result.data, result.pagination);
  }

  static async getPosts(ctx) {
    const { page, limit, status, category_id } = ctx.query;
    const whereClauses = ['p.deleted_at IS NULL'];
    const params = [];
    if (status && status !== 'all') { whereClauses.push("p.status = ?"); params.push(status); }
    if (category_id && category_id !== 'all') { whereClauses.push('p.category_id = ?'); params.push(parseInt(category_id)); }
    const whereClause = whereClauses.join(' AND ');
    const limitVal = parseInt(limit) || 20;
    const offset = ((parseInt(page) || 1) - 1) * limitVal;
    const posts = await db.query(`
      SELECT p.*, c.name as category_name, u.username as author_username
      FROM posts p LEFT JOIN categories c ON p.category_id = c.id LEFT JOIN users u ON p.user_id = u.id
      WHERE ${whereClause} ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT ? OFFSET ?
    `, [...params, limitVal, offset]);
    const totalResult = await db.queryOne(`SELECT COUNT(*) as total FROM posts p WHERE ${whereClause}`, params);
    Response.paginated(ctx, posts, { page: parseInt(page) || 1, limit: limitVal, total: totalResult.total, totalPages: Math.ceil(totalResult.total / limitVal) });
  }

  static async bulkDeletePosts(ctx) {
    const user = ctx.state.user;
    const { post_ids } = ctx.request.body;
    if (!post_ids || !post_ids.length) { Response.error(ctx, 'No posts selected', 400); return; }
    await db.transaction(async (conn) => {
      for (const id of post_ids) {
        await conn.execute("UPDATE posts SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
      }
    });
    await LogService.log({ user_id: user.id, action: LOG_ACTIONS.POST_BULK_DELETE, target_type: 'posts', details: { count: post_ids.length }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: `${post_ids.length} posts deleted` });
  }

  static async bulkPinPosts(ctx) {
    const user = ctx.state.user;
    const { post_ids, is_pinned } = ctx.request.body;
    if (!post_ids || !post_ids.length) { Response.error(ctx, 'No posts selected', 400); return; }
    await db.transaction(async (conn) => {
      for (const id of post_ids) {
        await conn.execute('UPDATE posts SET is_pinned = ? WHERE id = ?', [is_pinned ? 1 : 0, id]);
      }
    });
    await LogService.log({ user_id: user.id, action: LOG_ACTIONS.POST_BULK_PIN, target_type: 'posts', details: { count: post_ids.length, is_pinned }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: `${post_ids.length} posts ${is_pinned ? 'pinned' : 'unpinned'}` });
  }

  static async bulkMovePosts(ctx) {
    const user = ctx.state.user;
    const { post_ids, category_id } = ctx.request.body;
    if (!post_ids || !post_ids.length) { Response.error(ctx, 'No posts selected', 400); return; }
    const category = await CategoryService.getById(parseInt(category_id));
    if (!category) { Response.notFound(ctx, 'Target category not found'); return; }
    await db.transaction(async (conn) => {
      for (const id of post_ids) {
        await conn.execute('UPDATE posts SET category_id = ? WHERE id = ?', [parseInt(category_id), id]);
      }
    });
    await LogService.log({ user_id: user.id, action: LOG_ACTIONS.POST_BULK_MOVE, target_type: 'posts', details: { count: post_ids.length, category_id }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: `${post_ids.length} posts moved` });
  }

  static async getTags(ctx) {
    const tags = await TagService.getAll();
    Response.success(ctx, tags);
  }

  static async createTag(ctx) {
    const user = ctx.state.user;
    const { name, slug } = ctx.request.body;
    const finalSlug = slug || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const existingTag = await TagService.getBySlug(finalSlug);
    if (existingTag) { Response.error(ctx, 'Tag already exists', 409); return; }
    const result = await db.execute('INSERT INTO tags (name, slug) VALUES (?, ?)', [name, finalSlug]);
    const tag = await db.queryOne('SELECT * FROM tags WHERE id = ?', [result.insertId]);
    await LogService.log({ user_id: user.id, action: LOG_ACTIONS.TAG_CREATE, target_type: 'tag', target_id: tag.id, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.created(ctx, tag);
  }

  static async updateTag(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const { name, slug } = ctx.request.body;
    const fields = []; const values = [];
    if (name) { fields.push('name = ?'); values.push(name); }
    if (slug) { fields.push('slug = ?'); values.push(slug); }
    if (!fields.length) { Response.error(ctx, 'No fields to update', 400); return; }
    values.push(parseInt(id));
    await db.execute(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`, values);
    const tag = await db.queryOne('SELECT * FROM tags WHERE id = ?', [parseInt(id)]);
    await LogService.log({ user_id: user.id, action: LOG_ACTIONS.TAG_UPDATE, target_type: 'tag', target_id: tag.id, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, tag);
  }

  static async deleteTag(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    await db.execute('DELETE FROM tags WHERE id = ?', [parseInt(id)]);
    await LogService.log({ user_id: user.id, action: LOG_ACTIONS.TAG_DELETE, target_type: 'tag', target_id: parseInt(id), ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: 'Tag deleted' });
  }

  static async mergeTags(ctx) {
    const user = ctx.state.user;
    const { from_tag_id, to_tag_id } = ctx.request.body;
    if (!from_tag_id || !to_tag_id) { Response.error(ctx, 'Both from_tag_id and to_tag_id required', 400); return; }
    const fromTag = await db.queryOne('SELECT * FROM tags WHERE id = ?', [parseInt(from_tag_id)]);
    const toTag = await db.queryOne('SELECT * FROM tags WHERE id = ?', [parseInt(to_tag_id)]);
    if (!fromTag || !toTag) { Response.notFound(ctx, 'Tag not found'); return; }
    await db.transaction(async (conn) => {
      await conn.execute('UPDATE post_tags SET tag_id = ? WHERE tag_id = ?', [toTag.id, fromTag.id]);
      await conn.execute('DELETE FROM tags WHERE id = ?', [fromTag.id]);
    });
    await LogService.log({ user_id: user.id, action: LOG_ACTIONS.TAG_MERGE, target_type: 'tag', details: { from: fromTag.name, to: toTag.name }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: `Merged "${fromTag.name}" into "${toTag.name}"` });
  }

  static async getModerationQueue(ctx) {
    const { page, limit, type } = ctx.query;
    const limitVal = parseInt(limit) || 20;
    const offset = ((parseInt(page) || 1) - 1) * limitVal;

    let items = [];
    if (!type || type === 'posts') {
      const posts = await db.query(`
        SELECT p.*, u.username as author_username, 'post' as item_type
        FROM posts p LEFT JOIN users u ON p.user_id = u.id
        WHERE p.status = 'pending' ORDER BY p.created_at ASC LIMIT ? OFFSET ?
      `, [limitVal, offset]);
      items = posts;
    }
    if (!type || type === 'replies') {
      const replies = await db.query(`
        SELECT r.*, u.username as author_username, 'reply' as item_type
        FROM replies r LEFT JOIN users u ON r.user_id = u.id
        WHERE r.status = 'pending' ORDER BY r.created_at ASC LIMIT ? OFFSET ?
      `, [limitVal, offset]);
      items = [...items, ...replies];
    }

    Response.paginated(ctx, items, { page: parseInt(page) || 1, limit: limitVal, total: items.length, totalPages: 1 });
  }

  static async approvePost(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    await db.execute("UPDATE posts SET status = 'published' WHERE id = ?", [parseInt(id)]);
    await LogService.log({ user_id: user.id, action: LOG_ACTIONS.MODERATION_APPROVE, target_type: 'post', target_id: parseInt(id), ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: 'Post approved' });
  }

  static async rejectPost(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    await db.execute("UPDATE posts SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP WHERE id = ?", [parseInt(id)]);
    await LogService.log({ user_id: user.id, action: LOG_ACTIONS.MODERATION_REJECT, target_type: 'post', target_id: parseInt(id), ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: 'Post rejected' });
  }

  static async getBans(ctx) {
    const { page, limit, ban_type, is_active } = ctx.query;
    const result = await BanService.getList({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      ban_type: ban_type || null,
      is_active: is_active !== undefined ? is_active === 'true' : undefined
    });
    Response.paginated(ctx, result.data, result.pagination);
  }

  static async createBan(ctx) {
    const user = ctx.state.user;
    const { ban_type, value, reason } = ctx.request.body;
    if (!ban_type || !value) { Response.error(ctx, 'ban_type and value required', 400); return; }
    const ban = await BanService.create({ ban_type, value, reason, created_by: user.id });
    await LogService.log({ user_id: user.id, action: LOG_ACTIONS.BAN_CREATE, target_type: 'ban', target_id: ban.id, details: { ban_type, value }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.created(ctx, ban);
  }

  static async updateBan(ctx) {
    const { id } = ctx.params;
    const ban = await BanService.update(parseInt(id), ctx.request.body);
    if (!ban) { Response.notFound(ctx, 'Ban not found'); return; }
    Response.success(ctx, ban);
  }

  static async deactivateBan(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const ban = await BanService.deactivate(parseInt(id));
    await LogService.log({ user_id: user.id, action: LOG_ACTIONS.BAN_DEACTIVATE, target_type: 'ban', target_id: parseInt(id), ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, ban);
  }

  static async cleanupSessions(ctx) {
    const user = ctx.state.user;
    // Sessions are now in Redis, TTL handles cleanup
    Response.success(ctx, { message: 'Session cleanup handled by Redis TTL' });
  }

  static async cleanupLogs(ctx) {
    const user = ctx.state.user;
    const days = await SettingService.getNumber('cleanup_log_retention_days') || 90;
    const result = await db.execute("DELETE FROM operation_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)", [days]);
    await LogService.log({ user_id: user.id, action: LOG_ACTIONS.CLEANUP_LOGS, target_type: 'logs', details: { deleted: result.affectedRows }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: `${result.affectedRows} logs cleaned` });
  }

  static async cleanupSoftDeleted(ctx) {
    const user = ctx.state.user;
    const days = await SettingService.getNumber('cleanup_soft_delete_retention_days') || 30;
    const postsResult = await db.execute("UPDATE posts SET content = '[deleted]', content_html = '[deleted]' WHERE deleted_at IS NOT NULL AND deleted_at < DATE_SUB(NOW(), INTERVAL ? DAY)", [days]);
    const repliesResult = await db.execute("UPDATE replies SET content = '[deleted]', content_html = '[deleted]' WHERE deleted_at IS NOT NULL AND deleted_at < DATE_SUB(NOW(), INTERVAL ? DAY)", [days]);
    await LogService.log({ user_id: user.id, action: LOG_ACTIONS.CLEANUP_SOFT_DELETED, target_type: 'soft_deleted', details: { posts: postsResult.affectedRows, replies: repliesResult.affectedRows }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: `${postsResult.affectedRows} posts, ${repliesResult.affectedRows} replies purged` });
  }
}

module.exports = AdminController;