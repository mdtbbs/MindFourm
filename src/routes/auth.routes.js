const Router = require('@koa/router');
const { authMiddleware } = require('../middleware/auth');
const AuthController = require('../controllers/auth.controller');

function createRoutes(basePrefix = '/api') {
  const router = new Router({ prefix: `${basePrefix}/auth` });

  router.get('/check', authMiddleware({ required: false }), AuthController.check);
  router.get('/callback', AuthController.callback);
  router.post('/verify-session', AuthController.verifySession);
  router.post('/logout', authMiddleware({ required: true }), AuthController.logout);

  return router;
}

module.exports = createRoutes();
module.exports.createRoutes = createRoutes;
