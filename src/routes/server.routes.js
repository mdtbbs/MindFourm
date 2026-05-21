const Router = require('@koa/router');
const ServerController = require('../controllers/server.controller');
const { authMiddleware } = require('../middleware/auth');

function createRoutes(prefix = '/api') {
  const router = new Router({ prefix: `${prefix}/servers` });

  // 公开路由（无需认证）
  router.get('/public', ServerController.getPublicServers);
  router.get('/versions', ServerController.getVersions);
  router.get('/templates', ServerController.getTemplates);
  router.get('/:id/basic', ServerController.getServerBasic);

  // 认证路由 - authMiddleware 设置 ctx.state.user
  router.get('/my', authMiddleware({ required: true }), ServerController.getUserServers);
  router.post('/apply', authMiddleware({ required: true }), ServerController.applyServer);

  return router;
}

module.exports = createRoutes();
module.exports.createRoutes = createRoutes;