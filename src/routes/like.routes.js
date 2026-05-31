const Router = require('@koa/router');
const { authMiddleware } = require('../middleware/auth');
const LikeController = require('../controllers/like.controller');

function createRoutes(basePrefix = '/api') {
  const router = new Router({ prefix: `${basePrefix}/likes` });

  // Post likes
  router.post('/posts/:postId', authMiddleware({ required: true }), LikeController.likePost);
  router.delete('/posts/:postId', authMiddleware({ required: true }), LikeController.unlikePost);
  router.get('/posts/:postId', authMiddleware({ required: false }), LikeController.checkPostLike);
  router.get('/posts', authMiddleware({ required: true }), LikeController.listLikedPosts);

  // Reply likes
  router.post('/replies/:replyId', authMiddleware({ required: true }), LikeController.likeReply);
  router.delete('/replies/:replyId', authMiddleware({ required: true }), LikeController.unlikeReply);
  router.get('/replies/:replyId', authMiddleware({ required: false }), LikeController.checkReplyLike);

  // User statistics
  router.get('/users/:userId/count', authMiddleware({ required: false }), LikeController.getUserLikeCount);

  return router;
}

module.exports = createRoutes();
module.exports.createRoutes = createRoutes;