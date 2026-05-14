const Response = require('../utils/response');
const BookmarkService = require('../services/bookmark.service');
const PostService = require('../services/post.service');

class BookmarkController {
  static add(ctx) {
    const postId = parseInt(ctx.params.postId);
    if (isNaN(postId)) {
      Response.error(ctx, 'Invalid post ID', 400);
      return;
    }
    const post = PostService.getById(postId);
    if (!post || post.status !== 'published') {
      Response.notFound(ctx, 'Post not found or not published');
      return;
    }

    const bookmark = BookmarkService.add(ctx.state.user.id, postId);
    Response.created(ctx, bookmark);
  }

  static remove(ctx) {
    const postId = parseInt(ctx.params.postId);
    if (isNaN(postId)) {
      Response.error(ctx, 'Invalid post ID', 400);
      return;
    }
    BookmarkService.remove(ctx.state.user.id, postId);
    Response.success(ctx, { message: 'Bookmark removed' });
  }

  static check(ctx) {
    const postId = parseInt(ctx.params.postId);
    if (isNaN(postId)) {
      Response.error(ctx, 'Invalid post ID', 400);
      return;
    }
    const bookmark = BookmarkService.getByUserAndPost(ctx.state.user.id, postId);
    Response.success(ctx, { bookmarked: !!bookmark });
  }

  static list(ctx) {
    const { page, limit } = ctx.query;
    const result = BookmarkService.getByUserId(ctx.state.user.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20
    });
    Response.paginated(ctx, result.data, result.pagination);
  }
}

module.exports = BookmarkController;
