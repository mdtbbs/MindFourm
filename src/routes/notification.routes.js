const Router = require('@koa/router');
const { authMiddleware } = require('../middleware/auth');
const NotificationController = require('../controllers/notification.controller');

function createRoutes(basePrefix = '/api') {
  const router = new Router({ prefix: `${basePrefix}/notifications` });

  router.get('/', authMiddleware({ required: true }), NotificationController.list);
  router.get('/cursor', authMiddleware({ required: true }), NotificationController.listCursor);
  router.get('/unread-count', authMiddleware({ required: true }), NotificationController.unreadCount);
  router.put('/:id/read', authMiddleware({ required: true }), NotificationController.markAsRead);
  router.put('/read-all', authMiddleware({ required: true }), NotificationController.markAllAsRead);

  return router;
}

module.exports = createRoutes();
module.exports.createRoutes = createRoutes;
