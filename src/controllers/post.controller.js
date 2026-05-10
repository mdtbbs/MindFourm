const Response = require('../utils/response');
const PostService = require('../services/post.service');
const LogService = require('../services/log.service');
const { LOG_ACTIONS } = require('../utils/constants');

class PostController {
  static list(ctx) {
    const { page, limit, category_id, status, user_id } = ctx.query;

    const result = PostService.getList({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      category_id: parseInt(category_id) || null,
      status: status || 'published',
      user_id: parseInt(user_id) || null
    });

    Response.paginated(ctx, result.data, result.pagination);
  }

  static getById(ctx) {
    const { id } = ctx.params;
    const post = PostService.getById(parseInt(id));

    if (!post) {
      Response.notFound(ctx, 'Post not found');
      return;
    }

    PostService.incrementViewCount(parseInt(id));

    const replies = PostService.getReplies ? [] : [];

    Response.success(ctx, { ...post, replies });
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
}

module.exports = PostController;