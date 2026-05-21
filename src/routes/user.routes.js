const Router = require('@koa/router');
const { authMiddleware } = require('../middleware/auth');
const UserController = require('../controllers/user.controller');
const { avatarUpload } = require('../middleware/upload');

function createRoutes(basePrefix = '/api') {
  const router = new Router({ prefix: `${basePrefix}/users` });

  // Authenticated: my profile routes (must be before /:id to avoid matching)
  router.get('/me', authMiddleware({ required: true }), UserController.getMyProfile);
  router.put('/me/profile', authMiddleware({ required: true }), UserController.updateProfile);
  router.post('/me/avatar', authMiddleware({ required: true }), avatarUpload, UserController.uploadAvatar);
  router.delete('/me/avatar', authMiddleware({ required: true }), UserController.removeAvatar);
  router.get('/me/replies', authMiddleware({ required: true }), UserController.getMyReplies);

  // Public: search users by username (for @mentions)
  router.get('/search', UserController.searchUsers);

  // Public: get user profile by ID
  router.get('/:id', UserController.getById);

  // Public: get user's replies
  router.get('/:id/replies', UserController.getRepliesByUserId);

  return router;
}

module.exports = createRoutes();
module.exports.createRoutes = createRoutes;
