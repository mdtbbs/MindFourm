const Router = require('@koa/router');
const { authMiddleware } = require('../middleware/auth');
const BookmarkController = require('../controllers/bookmark.controller');

function createRoutes(basePrefix = '/api') {
  const router = new Router({ prefix: `${basePrefix}/bookmarks` });

  router.get('/', authMiddleware({ required: true }), BookmarkController.list);
  router.get('/check/:postId', authMiddleware({ required: true }), BookmarkController.check);
  router.post('/:postId', authMiddleware({ required: true }), BookmarkController.add);
  router.delete('/:postId', authMiddleware({ required: true }), BookmarkController.remove);

  return router;
}

module.exports = createRoutes();
module.exports.createRoutes = createRoutes;
