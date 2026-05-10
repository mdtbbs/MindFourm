const Response = require('../utils/response');
const CategoryService = require('../services/category.service');
const PostService = require('../services/post.service');
const UserService = require('../services/user.service');
const LogService = require('../services/log.service');
const { LOG_ACTIONS, ROLE_NAMES } = require('../utils/constants');

class AdminController {
  static createCategory(ctx) {
    const user = ctx.state.user;
    const { name, slug, sort_order } = ctx.request.body;

    const category = CategoryService.create({
      name,
      slug,
      sort_order: parseInt(sort_order) || 0
    });

    LogService.log({
      user_id: user.id,
      action: LOG_ACTIONS.CATEGORY_CREATE,
      target_type: 'category',
      target_id: category.id,
      ip_address: ctx.ip,
      user_agent: ctx.headers['user-agent']
    });

    Response.created(ctx, category);
  }

  static updateCategory(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const { name, slug, sort_order, is_active } = ctx.request.body;

    const category = CategoryService.update(parseInt(id), {
      name,
      slug,
      sort_order: parseInt(sort_order) || undefined,
      is_active: parseInt(is_active) || undefined
    });

    LogService.log({
      user_id: user.id,
      action: LOG_ACTIONS.CATEGORY_EDIT,
      target_type: 'category',
      target_id: category.id,
      ip_address: ctx.ip,
      user_agent: ctx.headers['user-agent']
    });

    Response.success(ctx, category);
  }

  static deleteCategory(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;

    CategoryService.delete(parseInt(id));

    LogService.log({
      user_id: user.id,
      action: LOG_ACTIONS.CATEGORY_DELETE,
      target_type: 'category',
      target_id: parseInt(id),
      ip_address: ctx.ip,
      user_agent: ctx.headers['user-agent']
    });

    Response.success(ctx, { message: 'Category deleted' });
  }

  static updateUserRole(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const { role } = ctx.request.body;

    if (!ROLE_NAMES.includes(role)) {
      Response.error(ctx, 'Invalid role', 400);
      return;
    }

    const targetUser = UserService.getById(parseInt(id));
    if (!targetUser) {
      Response.notFound(ctx, 'User not found');
      return;
    }

    const updatedUser = UserService.updateRole(parseInt(id), role);

    LogService.log({
      user_id: user.id,
      action: LOG_ACTIONS.USER_ROLE_CHANGE,
      target_type: 'user',
      target_id: parseInt(id),
      details: { old_role: targetUser.role, new_role: role },
      ip_address: ctx.ip,
      user_agent: ctx.headers['user-agent']
    });

    Response.success(ctx, updatedUser);
  }

  static pinPost(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const { is_pinned } = ctx.request.body;

    const post = PostService.pin(parseInt(id), is_pinned);

    if (!post) {
      Response.notFound(ctx, 'Post not found');
      return;
    }

    LogService.log({
      user_id: user.id,
      action: LOG_ACTIONS.POST_PIN,
      target_type: 'post',
      target_id: post.id,
      details: { is_pinned },
      ip_address: ctx.ip,
      user_agent: ctx.headers['user-agent']
    });

    Response.success(ctx, post);
  }

  static movePost(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const { category_id } = ctx.request.body;

    const category = CategoryService.getById(parseInt(category_id));
    if (!category) {
      Response.notFound(ctx, 'Target category not found');
      return;
    }

    const post = PostService.move(parseInt(id), parseInt(category_id));

    if (!post) {
      Response.notFound(ctx, 'Post not found');
      return;
    }

    LogService.log({
      user_id: user.id,
      action: LOG_ACTIONS.POST_MOVE,
      target_type: 'post',
      target_id: post.id,
      details: { old_category_id: post.category_id, new_category_id: category_id },
      ip_address: ctx.ip,
      user_agent: ctx.headers['user-agent']
    });

    Response.success(ctx, post);
  }

  static getLogs(ctx) {
    const { page, limit, user_id, action, target_type } = ctx.query;

    const result = LogService.getLogs({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      user_id: parseInt(user_id) || null,
      action: action || null,
      target_type: target_type || null
    });

    Response.paginated(ctx, result.data, result.pagination);
  }
}

module.exports = AdminController;