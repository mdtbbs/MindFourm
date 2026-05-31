const Response = require('../utils/response');
const LikeService = require('../services/like.service');
const PostService = require('../services/post.service');
const ReplyService = require('../services/reply.service');

class LikeController {
  // Post likes
  static async likePost(ctx) {
    const postId = parseInt(ctx.params.postId);
    if (isNaN(postId)) {
      Response.error(ctx, 'Invalid post ID', 400);
      return;
    }

    const post = await PostService.getById(postId);
    if (!post || post.deleted_at) {
      Response.notFound(ctx, 'Post not found');
      return;
    }

    const like = await LikeService.likePost(ctx.state.user.id, postId);
    Response.created(ctx, like);
  }

  static async unlikePost(ctx) {
    const postId = parseInt(ctx.params.postId);
    if (isNaN(postId)) {
      Response.error(ctx, 'Invalid post ID', 400);
      return;
    }

    await LikeService.unlikePost(ctx.state.user.id, postId);
    Response.success(ctx, { message: 'Like removed' });
  }

  static async checkPostLike(ctx) {
    const postId = parseInt(ctx.params.postId);
    if (isNaN(postId)) {
      Response.error(ctx, 'Invalid post ID', 400);
      return;
    }

    // Allow checking without auth (for public display)
    const userId = ctx.state.user?.id;
    if (!userId) {
      Response.success(ctx, { liked: false, count: await LikeService.getPostLikeCount(postId) });
      return;
    }

    const liked = await LikeService.isPostLiked(userId, postId);
    const count = await LikeService.getPostLikeCount(postId);
    Response.success(ctx, { liked: !!liked, count });
  }

  static async listLikedPosts(ctx) {
    const { page, limit } = ctx.query;
    const result = await LikeService.getUserLikedPosts(ctx.state.user.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20
    });
    Response.paginated(ctx, result.data, result.pagination);
  }

  // Reply likes
  static async likeReply(ctx) {
    const replyId = parseInt(ctx.params.replyId);
    if (isNaN(replyId)) {
      Response.error(ctx, 'Invalid reply ID', 400);
      return;
    }

    const reply = await ReplyService.getById(replyId);
    if (!reply || reply.deleted_at) {
      Response.notFound(ctx, 'Reply not found');
      return;
    }

    const like = await LikeService.likeReply(ctx.state.user.id, replyId);
    Response.created(ctx, like);
  }

  static async unlikeReply(ctx) {
    const replyId = parseInt(ctx.params.replyId);
    if (isNaN(replyId)) {
      Response.error(ctx, 'Invalid reply ID', 400);
      return;
    }

    await LikeService.unlikeReply(ctx.state.user.id, replyId);
    Response.success(ctx, { message: 'Like removed' });
  }

  static async checkReplyLike(ctx) {
    const replyId = parseInt(ctx.params.replyId);
    if (isNaN(replyId)) {
      Response.error(ctx, 'Invalid reply ID', 400);
      return;
    }

    // Allow checking without auth (for public display)
    const userId = ctx.state.user?.id;
    if (!userId) {
      Response.success(ctx, { liked: false, count: await LikeService.getReplyLikeCount(replyId) });
      return;
    }

    const liked = await LikeService.isReplyLiked(userId, replyId);
    const count = await LikeService.getReplyLikeCount(replyId);
    Response.success(ctx, { liked: !!liked, count });
  }

  // User statistics
  static async getUserLikeCount(ctx) {
    const userId = parseInt(ctx.params.userId);
    if (isNaN(userId)) {
      Response.error(ctx, 'Invalid user ID', 400);
      return;
    }

    const count = await LikeService.getUserReceivedLikeCount(userId);
    Response.success(ctx, { count });
  }
}

module.exports = LikeController;