const Router = require('@koa/router');
const { authMiddleware } = require('../middleware/auth');
const MessageController = require('../controllers/message.controller');

function createRoutes(basePrefix = '/api') {
  const router = new Router({ prefix: `${basePrefix}/messages` });

  router.post('/', authMiddleware({ required: true }), MessageController.send);
  router.get('/', authMiddleware({ required: true }), MessageController.getConversations);
  router.get('/unread-count', authMiddleware({ required: true }), MessageController.unreadCount);
  router.get('/:userId', authMiddleware({ required: true }), MessageController.getConversation);
  router.delete('/:id', authMiddleware({ required: true }), MessageController.deleteMessage);

  return router;
}

module.exports = { createRoutes };
