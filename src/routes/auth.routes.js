const Router = require('@koa/router');
const { authMiddleware } = require('../middleware/auth');
const AuthController = require('../controllers/auth.controller');

const router = new Router({ prefix: '/api/auth' });

router.get('/check', authMiddleware({ required: false }), AuthController.check);
router.get('/callback', AuthController.callback);
router.post('/verify-session', AuthController.verifySession);
router.post('/logout', authMiddleware({ required: true }), AuthController.logout);

module.exports = router;