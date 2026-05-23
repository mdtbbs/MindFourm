const Response = require('../utils/response');
const ReplyService = require('../services/reply.service');
const PostService = require('../services/post.service');
const LogService = require('../services/log.service');
const { LOG_ACTIONS } = require('../utils/constants');

class ReplyController {
  static async list(ctx) {
    const { postId } = ctx.params;
    const { page, limit } = ctx.query;

    const post = await PostService.getById(parseInt(postId));
    if (!post) {
      Response.notFound(ctx, 'Post not found');
      return;
    }

    const result = await ReplyService.getByPostId(parseInt(postId), {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50
    });

    Response.paginated(ctx, result.data, result.pagination);
  }

  static async create(ctx) {
    const user = ctx.state.user;
    const { postId } = ctx.params;
    const { content, parent_reply_id } = ctx.request.body;

    const post = await PostService.getById(parseInt(postId));
    if (!post || post.status !== 'published') {
      Response.notFound(ctx, 'Post not found or not published');
      return;
    }

    const reply = await ReplyService.create({
      post_id: parseInt(postId),
      user_id: user.id,
      content,
      parent_reply_id: parseInt(parent_reply_id) || null
    });

    await LogService.log({
      user_id: user.id,
      action: LOG_ACTIONS.REPLY_CREATE,
      target_type: 'reply',
      target_id: reply.id,
      details: { post_id: parseInt(postId), parent_reply_id },
      ip_address: ctx.ip,
      user_agent: ctx.headers['user-agent']
    });

    Response.created(ctx, reply);
  }

  static async update(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const { content } = ctx.request.body;

    const existingReply = await ReplyService.getById(parseInt(id));
    if (!existingReply) {
      Response.notFound(ctx, 'Reply not found');
      return;
    }

    const reply = await ReplyService.update(parseInt(id), content);

    await LogService.log({
      user_id: user.id,
      action: LOG_ACTIONS.REPLY_EDIT,
      target_type: 'reply',
      target_id: reply.id,
      ip_address: ctx.ip,
      user_agent: ctx.headers['user-agent']
    });

    Response.success(ctx, reply);
  }

  static async delete(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;

    const reply = await ReplyService.getById(parseInt(id));
    if (!reply) {
      Response.notFound(ctx, 'Reply not found');
      return;
    }

    await ReplyService.softDelete(parseInt(id));

    await LogService.log({
      user_id: user.id,
      action: LOG_ACTIONS.REPLY_DELETE,
      target_type: 'reply',
      target_id: parseInt(id),
      ip_address: ctx.ip,
      user_agent: ctx.headers['user-agent']
    });

    Response.success(ctx, { message: 'Reply deleted' });
  }
}

module.exports = ReplyController;