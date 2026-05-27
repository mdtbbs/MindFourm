const Router = require('@koa/router');
const { authMiddleware } = require('../middleware/auth');
const { createDynamicRateLimit } = require('../middleware/rate-limit');
const AuthController = require('../controllers/auth.controller');

function createRoutes(basePrefix = '/api') {
  const router = new Router({ prefix: `${basePrefix}/auth` });

  router.get('/check', authMiddleware({ required: false }), AuthController.check);
  router.get('/callback', AuthController.callback);
  router.post('/exchange', AuthController.exchange);
  router.post('/verify-session',
    createDynamicRateLimit('login', 'rate_login_max', 'rate_login_lock_min', { max: 5, windowMin: 15 }),
    AuthController.verifySession
  );
  router.post('/logout', authMiddleware({ required: true }), AuthController.logout);

  return router;
}

module.exports = createRoutes();
module.exports.createRoutes = createRoutes;
