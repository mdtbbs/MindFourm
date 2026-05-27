const Response = require('../utils/response');
const PostService = require('../services/post.service');
const ReplyService = require('../services/reply.service');
const LogService = require('../services/log.service');
const NotificationService = require('../services/notification.service');
const { LOG_ACTIONS, NOTIFICATION_TYPES } = require('../utils/constants');

class PostController {
  static async list(ctx) {
    const { page, limit, category_id, status, user_id, search } = ctx.query;

    const result = await PostService.getList({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      category_id: parseInt(category_id) || null,
      status: status || 'published',
      user_id: parseInt(user_id) || null,
      search: search || null
    });

    const trimmed = result.data.map(p => {
      const { content_html, ...rest } = p;
      return rest;
    });

    Response.paginated(ctx, trimmed, result.pagination);
  }

  static async getById(ctx) {
    const { id } = ctx.params;
    // 使用合并查询方法，异步增加浏览计数
    const post = await PostService.getPostDetail(parseInt(id));

    if (!post) {
      Response.notFound(ctx, 'Post not found');
      return;
    }

    const { page: repliesPage, limit: repliesLimit } = ctx.query;
    const repliesResult = await ReplyService.getByPostId(parseInt(id), {
      page: parseInt(repliesPage) || 1,
      limit: parseInt(repliesLimit) || 20
    });

    Response.success(ctx, { ...post, replies: repliesResult.data, repliesPagination: repliesResult.pagination });
  }

  static async create(ctx) {
    const user = ctx.state.user;
    const { title, content, category_id, tags, status } = ctx.request.body;

    const post = await PostService.create({
      user_id: user.id,
      title,
      content,
      category_id: parseInt(category_id) || null,
      tags,
      status: status || 'draft'
    });

    if (status === 'published' || status === 'pending') {
      await NotificationService.notifyMentionedUsers(content, post.id, user.id, null);
    }

    await LogService.log({
      user_id: user.id,
      action: LOG_ACTIONS.POST_CREATE,
      target_type: 'post',
      target_id: post.id,
      ip_address: ctx.ip,
      user_agent: ctx.headers['user-agent']
    });

    Response.created(ctx, post);
  }

  static async update(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const { title, content, category_id, tags, status } = ctx.request.body;

    const existingPost = await PostService.getById(parseInt(id));
    if (!existingPost) {
      Response.notFound(ctx, 'Post not found');
      return;
    }

    const updates = {};
    if (title) updates.title = title;
    if (content) updates.content = content;
    if (category_id) updates.category_id = parseInt(category_id);
    if (tags) updates.tags = tags;
    if (status) updates.status = status;

    const post = await PostService.update(parseInt(id), updates);

    await LogService.log({
      user_id: user.id,
      action: LOG_ACTIONS.POST_EDIT,
      target_type: 'post',
      target_id: post.id,
      ip_address: ctx.ip,
      user_agent: ctx.headers['user-agent']
    });

    Response.success(ctx, post);
  }

  static async delete(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;

    const post = await PostService.getById(parseInt(id));
    if (!post) {
      Response.notFound(ctx, 'Post not found');
      return;
    }

    await PostService.softDelete(parseInt(id));

    await LogService.log({
      user_id: user.id,
      action: LOG_ACTIONS.POST_DELETE,
      target_type: 'post',
      target_id: parseInt(id),
      ip_address: ctx.ip,
      user_agent: ctx.headers['user-agent']
    });

    Response.success(ctx, { message: 'Post deleted' });
  }

  static async listCursor(ctx) {
    const { limit, cursor, category_id, search } = ctx.query;
    const result = await PostService.getListCursor({
      limit: parseInt(limit) || 20,
      cursor: cursor || null,
      category_id: category_id ? parseInt(category_id) : null,
      search: search || null,
    });

    const trimmed = result.data.map(p => {
      const { content_html, ...rest } = p;
      return rest;
    });

    Response.success(ctx, { data: trimmed, next_cursor: result.next_cursor, has_more: result.has_more });
  }
}

module.exports = PostController;