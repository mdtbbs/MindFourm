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
  // ====== Existing methods ======
  static createCategory(ctx) {
    const user = ctx.state.user;
    const { name, slug, sort_order } = ctx.request.body;
    const category = CategoryService.create({ name, slug, sort_order: parseInt(sort_order) || 0 });
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.CATEGORY_CREATE, target_type: 'category', target_id: category.id, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.created(ctx, category);
  }

  static updateCategory(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const { name, slug, sort_order, is_active } = ctx.request.body;
    const category = CategoryService.update(parseInt(id), { name, slug, sort_order: parseInt(sort_order) || undefined, is_active: parseInt(is_active) || undefined });
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.CATEGORY_EDIT, target_type: 'category', target_id: category.id, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, category);
  }

  static deleteCategory(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    CategoryService.delete(parseInt(id));
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.CATEGORY_DELETE, target_type: 'category', target_id: parseInt(id), ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: 'Category deleted' });
  }

  static updateUserRole(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const { role } = ctx.request.body;
    if (!['guest', 'user', 'moderator', 'admin'].includes(role)) { Response.error(ctx, 'Invalid role', 400); return; }
    const targetUser = UserService.getById(parseInt(id));
    if (!targetUser) { Response.notFound(ctx, 'User not found'); return; }
    const updatedUser = UserService.updateRole(parseInt(id), role);
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.USER_ROLE_CHANGE, target_type: 'user', target_id: parseInt(id), details: { old_role: targetUser.role, new_role: role }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, updatedUser);
  }

  static pinPost(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const { is_pinned } = ctx.request.body;
    const post = PostService.pin(parseInt(id), is_pinned);
    if (!post) { Response.notFound(ctx, 'Post not found'); return; }
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.POST_PIN, target_type: 'post', target_id: post.id, details: { is_pinned }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, post);
  }

  static movePost(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const { category_id } = ctx.request.body;
    const category = CategoryService.getById(parseInt(category_id));
    if (!category) { Response.notFound(ctx, 'Target category not found'); return; }
    const post = PostService.move(parseInt(id), parseInt(category_id));
    if (!post) { Response.notFound(ctx, 'Post not found'); return; }
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.POST_MOVE, target_type: 'post', target_id: post.id, details: { old_category_id: post.category_id, new_category_id: category_id }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, post);
  }

  static getLogs(ctx) {
    const { page, limit, user_id, action, target_type } = ctx.query;
    const result = LogService.getLogs({ page: parseInt(page) || 1, limit: parseInt(limit) || 50, user_id: parseInt(user_id) || null, action: action || null, target_type: target_type || null });
    Response.paginated(ctx, result.data, result.pagination);
  }

  // ====== NEW: Stats ======
  static getStats(ctx) {
    const stats = StatService.getDashboardStats();
    Response.success(ctx, stats);
  }

  // ====== NEW: Badge counts for sidebar ======
  static getBadgeCounts(ctx) {
    const moderationCount = db.prepare(`
      SELECT (SELECT COUNT(*) FROM posts WHERE status = 'pending') + (SELECT COUNT(*) FROM replies WHERE status = 'pending') as total
    `).get().total;
    const announceActive = SettingService.get('announce_enabled') === 'true' ? 1 : 0;
    Response.success(ctx, { moderation_pending: moderationCount, announce_active: announceActive });
  }

  // ====== NEW: Settings ======
  static getSettings(ctx) {
    const { category } = ctx.params;
    if (category) {
      Response.success(ctx, SettingService.getByCategory(category));
    } else {
      Response.success(ctx, SettingService.getAll());
    }
  }

  static updateSettings(ctx) {
    const user = ctx.state.user;
    const { category } = ctx.params;
    const updates = ctx.request.body;
    const result = SettingService.setBatch(category, updates);
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.SETTINGS_UPDATE, target_type: 'settings', target_id: category, details: { keys: Object.keys(updates) }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, result);
  }

  // ====== NEW: Users list ======
  static getUsers(ctx) {
    const { page, limit, search } = ctx.query;
    const result = UserService.getAll({ page: parseInt(page) || 1, limit: parseInt(limit) || 20, search: search || null });
    Response.paginated(ctx, result.data, result.pagination);
  }

  // ====== NEW: Posts list for admin ======
  static getPosts(ctx) {
    const { page, limit, status, category_id } = ctx.query;
    const whereClauses = ['p.deleted_at IS NULL'];
    const params = [];
    if (status && status !== 'all') { whereClauses.push("p.status = ?"); params.push(status); }
    if (category_id && category_id !== 'all') { whereClauses.push('p.category_id = ?'); params.push(parseInt(category_id)); }
    const whereClause = whereClauses.join(' AND ');
    const limitVal = parseInt(limit) || 20;
    const offset = ((parseInt(page) || 1) - 1) * limitVal;
    const posts = db.prepare(`
      SELECT p.*, c.name as category_name, u.username as author_username
      FROM posts p LEFT JOIN categories c ON p.category_id = c.id LEFT JOIN users u ON p.user_id = u.id
      WHERE ${whereClause} ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, limitVal, offset);
    const total = db.prepare(`SELECT COUNT(*) as total FROM posts p WHERE ${whereClause}`).get(...params).total;
    Response.paginated(ctx, posts, { page: parseInt(page) || 1, limit: limitVal, total, totalPages: Math.ceil(total / limitVal) });
  }

  // ====== NEW: Bulk post operations ======
  static bulkDeletePosts(ctx) {
    const user = ctx.state.user;
    const { post_ids } = ctx.request.body;
    if (!post_ids || !post_ids.length) { Response.error(ctx, 'No posts selected', 400); return; }
    const stmt = db.prepare("UPDATE posts SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP WHERE id = ?");
    db.transaction(() => { for (const id of post_ids) stmt.run(id); })();
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.POST_BULK_DELETE, target_type: 'posts', details: { count: post_ids.length }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: `${post_ids.length} posts deleted` });
  }

  static bulkPinPosts(ctx) {
    const user = ctx.state.user;
    const { post_ids, is_pinned } = ctx.request.body;
    if (!post_ids || !post_ids.length) { Response.error(ctx, 'No posts selected', 400); return; }
    const stmt = db.prepare('UPDATE posts SET is_pinned = ? WHERE id = ?');
    db.transaction(() => { for (const id of post_ids) stmt.run(is_pinned ? 1 : 0, id); })();
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.POST_BULK_PIN, target_type: 'posts', details: { count: post_ids.length, is_pinned }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: `${post_ids.length} posts ${is_pinned ? 'pinned' : 'unpinned'}` });
  }

  static bulkMovePosts(ctx) {
    const user = ctx.state.user;
    const { post_ids, category_id } = ctx.request.body;
    if (!post_ids || !post_ids.length) { Response.error(ctx, 'No posts selected', 400); return; }
    const category = CategoryService.getById(parseInt(category_id));
    if (!category) { Response.notFound(ctx, 'Target category not found'); return; }
    const stmt = db.prepare('UPDATE posts SET category_id = ? WHERE id = ?');
    db.transaction(() => { for (const id of post_ids) stmt.run(parseInt(category_id), id); })();
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.POST_BULK_MOVE, target_type: 'posts', details: { count: post_ids.length, category_id }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: `${post_ids.length} posts moved` });
  }

  // ====== NEW: Tags CRUD ======
  static getTags(ctx) {
    const tags = TagService.getAll();
    Response.success(ctx, tags);
  }

  static createTag(ctx) {
    const user = ctx.state.user;
    const { name, slug } = ctx.request.body;
    const finalSlug = slug || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (TagService.getBySlug(finalSlug)) { Response.error(ctx, 'Tag already exists', 409); return; }
    const result = db.prepare('INSERT INTO tags (name, slug) VALUES (?, ?)').run(name, finalSlug);
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.TAG_CREATE, target_type: 'tag', target_id: tag.id, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.created(ctx, tag);
  }

  static updateTag(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const { name, slug } = ctx.request.body;
    const fields = []; const values = [];
    if (name) { fields.push('name = ?'); values.push(name); }
    if (slug) { fields.push('slug = ?'); values.push(slug); }
    if (!fields.length) { Response.error(ctx, 'No fields to update', 400); return; }
    values.push(parseInt(id));
    db.prepare(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(parseInt(id));
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.TAG_UPDATE, target_type: 'tag', target_id: tag.id, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, tag);
  }

  static deleteTag(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    db.prepare('DELETE FROM tags WHERE id = ?').run(parseInt(id));
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.TAG_DELETE, target_type: 'tag', target_id: parseInt(id), ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: 'Tag deleted' });
  }

  static mergeTags(ctx) {
    const user = ctx.state.user;
    const { from_tag_id, to_tag_id } = ctx.request.body;
    if (!from_tag_id || !to_tag_id) { Response.error(ctx, 'Both from_tag_id and to_tag_id required', 400); return; }
    const fromTag = db.prepare('SELECT * FROM tags WHERE id = ?').get(parseInt(from_tag_id));
    const toTag = db.prepare('SELECT * FROM tags WHERE id = ?').get(parseInt(to_tag_id));
    if (!fromTag || !toTag) { Response.notFound(ctx, 'Tag not found'); return; }
    db.prepare('UPDATE OR IGNORE post_tags SET tag_id = ? WHERE tag_id = ?').run(toTag.id, fromTag.id);
    db.prepare('DELETE FROM tags WHERE id = ?').run(fromTag.id);
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.TAG_MERGE, target_type: 'tag', details: { from: fromTag.name, to: toTag.name }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: `Merged "${fromTag.name}" into "${toTag.name}"` });
  }

  // ====== NEW: Moderation ======
  static getModerationQueue(ctx) {
    const { page, limit, type } = ctx.query;
    const limitVal = parseInt(limit) || 20;
    const offset = ((parseInt(page) || 1) - 1) * limitVal;

    let items = [];
    if (!type || type === 'posts') {
      const posts = db.prepare(`
        SELECT p.*, u.username as author_username, 'post' as item_type
        FROM posts p LEFT JOIN users u ON p.user_id = u.id
        WHERE p.status = 'pending' ORDER BY p.created_at ASC LIMIT ? OFFSET ?
      `).all(limitVal, offset);
      items = posts;
    }
    if (!type || type === 'replies') {
      const replies = db.prepare(`
        SELECT r.*, u.username as author_username, 'reply' as item_type
        FROM replies r LEFT JOIN users u ON r.user_id = u.id
        WHERE r.status = 'pending' ORDER BY r.created_at ASC LIMIT ? OFFSET ?
      `).all(limitVal, offset);
      items = [...items, ...replies];
    }

    Response.paginated(ctx, items, { page: parseInt(page) || 1, limit: limitVal, total: items.length, totalPages: 1 });
  }

  static approvePost(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    db.prepare("UPDATE posts SET status = 'published' WHERE id = ?").run(parseInt(id));
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.MODERATION_APPROVE, target_type: 'post', target_id: parseInt(id), ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: 'Post approved' });
  }

  static rejectPost(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    db.prepare("UPDATE posts SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(parseInt(id));
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.MODERATION_REJECT, target_type: 'post', target_id: parseInt(id), ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: 'Post rejected' });
  }

  // ====== NEW: Bans ======
  static getBans(ctx) {
    const { page, limit, ban_type, is_active } = ctx.query;
    const result = BanService.getList({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      ban_type: ban_type || null,
      is_active: is_active !== undefined ? is_active === 'true' : undefined
    });
    Response.paginated(ctx, result.data, result.pagination);
  }

  static createBan(ctx) {
    const user = ctx.state.user;
    const { ban_type, value, reason } = ctx.request.body;
    if (!ban_type || !value) { Response.error(ctx, 'ban_type and value required', 400); return; }
    const ban = BanService.create({ ban_type, value, reason, created_by: user.id });
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.BAN_CREATE, target_type: 'ban', target_id: ban.id, details: { ban_type, value }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.created(ctx, ban);
  }

  static updateBan(ctx) {
    const { id } = ctx.params;
    const ban = BanService.update(parseInt(id), ctx.request.body);
    if (!ban) { Response.notFound(ctx, 'Ban not found'); return; }
    Response.success(ctx, ban);
  }

  static deactivateBan(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const ban = BanService.deactivate(parseInt(id));
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.BAN_DEACTIVATE, target_type: 'ban', target_id: parseInt(id), ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, ban);
  }

  // ====== NEW: Cleanup ======
  static cleanupSessions(ctx) {
    const user = ctx.state.user;
    const result = db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.CLEANUP_SESSIONS, target_type: 'sessions', details: { deleted: result.changes }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: `${result.changes} sessions cleaned` });
  }

  static cleanupLogs(ctx) {
    const user = ctx.state.user;
    const days = SettingService.getNumber('cleanup_log_retention_days') || 90;
    const result = db.prepare("DELETE FROM operation_logs WHERE created_at < datetime('now', ?)").run(`-${days} days`);
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.CLEANUP_LOGS, target_type: 'logs', details: { deleted: result.changes }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: `${result.changes} logs cleaned` });
  }

  static cleanupSoftDeleted(ctx) {
    const user = ctx.state.user;
    const days = SettingService.getNumber('cleanup_soft_delete_retention_days') || 30;
    const postsResult = db.prepare("UPDATE posts SET content = '[deleted]', content_html = '[deleted]', deleted_at = CURRENT_TIMESTAMP WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', ?)").run(`-${days} days`);
    const repliesResult = db.prepare("UPDATE replies SET content = '[deleted]', content_html = '[deleted]', deleted_at = CURRENT_TIMESTAMP WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', ?)").run(`-${days} days`);
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.CLEANUP_SOFT_DELETED, target_type: 'soft_deleted', details: { posts: postsResult.changes, replies: repliesResult.changes }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: `${postsResult.changes} posts, ${repliesResult.changes} replies purged` });
  }
}

module.exports = AdminController;
