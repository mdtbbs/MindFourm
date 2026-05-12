const Router = require('@koa/router');
const { authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { requireAdmin, requireModerator } = require('../middleware/permission');
const { CATEGORY_SCHEMA, ROLE_SCHEMA } = require('../validators/common.validator');
const AdminController = require('../controllers/admin.controller');

function createRoutes(basePrefix = '/api') {
  const router = new Router({ prefix: `${basePrefix}/admin` });

  // === Stats ===
  router.get('/stats', authMiddleware({ required: true }), AdminController.getStats);

  // === Settings ===
  router.get('/settings', authMiddleware({ required: true }), requireAdmin, AdminController.getSettings);
  router.get('/settings/:category', authMiddleware({ required: true }), requireAdmin, AdminController.getSettings);
  router.put('/settings/:category', authMiddleware({ required: true }), requireAdmin, AdminController.updateSettings);

  // === Users ===
  router.get('/users', authMiddleware({ required: true }), requireAdmin, AdminController.getUsers);
  router.put('/users/:id/role', authMiddleware({ required: true }), requireAdmin, validate(ROLE_SCHEMA), AdminController.updateUserRole);

  // === Posts ===
  router.get('/posts', authMiddleware({ required: true }), requireModerator, AdminController.getPosts);
  router.delete('/posts', authMiddleware({ required: true }), requireModerator, AdminController.bulkDeletePosts);
  router.put('/posts/pin', authMiddleware({ required: true }), requireModerator, AdminController.bulkPinPosts);
  router.put('/posts/move', authMiddleware({ required: true }), requireModerator, AdminController.bulkMovePosts);
  router.put('/posts/:id/pin', authMiddleware({ required: true }), requireModerator, AdminController.pinPost);
  router.put('/posts/:id/move', authMiddleware({ required: true }), requireModerator, AdminController.movePost);

  // === Categories ===
  router.post('/categories', authMiddleware({ required: true }), requireAdmin, validate(CATEGORY_SCHEMA), AdminController.createCategory);
  router.put('/categories/:id', authMiddleware({ required: true }), requireAdmin, validate(CATEGORY_SCHEMA), AdminController.updateCategory);
  router.delete('/categories/:id', authMiddleware({ required: true }), requireAdmin, AdminController.deleteCategory);

  // === Tags ===
  router.get('/tags', authMiddleware({ required: true }), requireAdmin, AdminController.getTags);
  router.post('/tags', authMiddleware({ required: true }), requireAdmin, AdminController.createTag);
  router.put('/tags/:id', authMiddleware({ required: true }), requireAdmin, AdminController.updateTag);
  router.delete('/tags/:id', authMiddleware({ required: true }), requireAdmin, AdminController.deleteTag);
  router.post('/tags/merge', authMiddleware({ required: true }), requireAdmin, AdminController.mergeTags);

  // === Moderation ===
  router.get('/moderation', authMiddleware({ required: true }), requireModerator, AdminController.getModerationQueue);
  router.put('/moderation/:id/approve', authMiddleware({ required: true }), requireModerator, AdminController.approvePost);
  router.put('/moderation/:id/reject', authMiddleware({ required: true }), requireModerator, AdminController.rejectPost);

  // === Bans ===
  router.get('/bans', authMiddleware({ required: true }), requireAdmin, AdminController.getBans);
  router.post('/bans', authMiddleware({ required: true }), requireAdmin, AdminController.createBan);
  router.put('/bans/:id', authMiddleware({ required: true }), requireAdmin, AdminController.updateBan);
  router.delete('/bans/:id', authMiddleware({ required: true }), requireAdmin, AdminController.deactivateBan);

  // === Cleanup ===
  router.post('/cleanup/sessions', authMiddleware({ required: true }), requireAdmin, AdminController.cleanupSessions);
  router.post('/cleanup/logs', authMiddleware({ required: true }), requireAdmin, AdminController.cleanupLogs);
  router.post('/cleanup/soft-deleted', authMiddleware({ required: true }), requireAdmin, AdminController.cleanupSoftDeleted);

  // === Logs ===
  router.get('/logs', authMiddleware({ required: true }), requireAdmin, AdminController.getLogs);

  return router;
}

module.exports = createRoutes();
module.exports.createRoutes = createRoutes;
