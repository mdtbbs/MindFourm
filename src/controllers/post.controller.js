const Response = require('../utils/response');
const PostService = require('../services/post.service');
const ReplyService = require('../services/reply.service');
const LogService = require('../services/log.service');
const NotificationService = require('../services/notification.service');
const { LOG_ACTIONS, NOTIFICATION_TYPES } = require('../utils/constants');
const { encodeCursor, decodeCursor } = require('../utils/cursor');

class PostController {
  static list(ctx) {
    const { page, limit, category_id, status, user_id, search } = ctx.query;

    const result = PostService.getList({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      category_id: parseInt(category_id) || null,
      status: status || 'published',
      user_id: parseInt(user_id) || null,
      search: search || null
    });

    // Strip content_html to reduce payload size
    const trimmed = result.data.map(p => {
      const { content_html, ...rest } = p;
      return rest;
    });

    Response.paginated(ctx, trimmed, result.pagination);
  }

  static getById(ctx) {
    const { id } = ctx.params;
    const post = PostService.getById(parseInt(id));

    if (!post) {
      Response.notFound(ctx, 'Post not found');
      return;
    }

    PostService.incrementViewCount(parseInt(id));

    const { page: repliesPage, limit: repliesLimit } = ctx.query;
    const repliesResult = ReplyService.getByPostId(parseInt(id), {
      page: parseInt(repliesPage) || 1,
      limit: parseInt(repliesLimit) || 20
    });

    Response.success(ctx, { ...post, replies: repliesResult.data, repliesPagination: repliesResult.pagination });
  }

  static create(ctx) {
    const user = ctx.state.user;
    const { title, content, category_id, tags, status } = ctx.request.body;

    const post = PostService.create({
      user_id: user.id,
      title,
      content,
      category_id: parseInt(category_id) || null,
      tags,
      status: status || 'draft'
    });

    // Notify @mentioned users in post content
    if (status === 'published' || status === 'pending') {
      NotificationService.notifyMentionedUsers(content, post.id, user.id, null);
    }

    LogService.log({
      user_id: user.id,
      action: LOG_ACTIONS.POST_CREATE,
      target_type: 'post',
      target_id: post.id,
      ip_address: ctx.ip,
      user_agent: ctx.headers['user-agent']
    });

    Response.created(ctx, post);
  }

  static update(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const { title, content, category_id, tags, status } = ctx.request.body;

    const existingPost = PostService.getById(parseInt(id));
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

    const post = PostService.update(parseInt(id), updates);

    LogService.log({
      user_id: user.id,
      action: LOG_ACTIONS.POST_EDIT,
      target_type: 'post',
      target_id: post.id,
      ip_address: ctx.ip,
      user_agent: ctx.headers['user-agent']
    });

    Response.success(ctx, post);
  }

  static delete(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;

    const post = PostService.getById(parseInt(id));
    if (!post) {
      Response.notFound(ctx, 'Post not found');
      return;
    }

    PostService.softDelete(parseInt(id));

    LogService.log({
      user_id: user.id,
      action: LOG_ACTIONS.POST_DELETE,
      target_type: 'post',
      target_id: parseInt(id),
      ip_address: ctx.ip,
      user_agent: ctx.headers['user-agent']
    });

    Response.success(ctx, { message: 'Post deleted' });
  }

  static listCursor(ctx) {
    const { limit, cursor, category_id, search } = ctx.query;
    const result = PostService.getListCursor({
      limit: parseInt(limit) || 20,
      cursor: cursor || null,
      category_id: category_id ? parseInt(category_id) : null,
      search: search || null,
    });

    // Strip content_html
    const trimmed = result.data.map(p => {
      const { content_html, ...rest } = p;
      return rest;
    });

    Response.success(ctx, { data: trimmed, next_cursor: result.next_cursor, has_more: result.has_more });
  }
}

module.exports = PostController;