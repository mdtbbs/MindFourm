const Router = require('@koa/router');
const { authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { requireAdmin, requireModerator } = require('../middleware/permission');
const { CATEGORY_SCHEMA, ROLE_SCHEMA } = require('../validators/common.validator');
const AdminController = require('../controllers/admin.controller');

function createRoutes(basePrefix = '/api') {
  const router = new Router({ prefix: `${basePrefix}/admin` });

  router.post('/categories',
    authMiddleware({ required: true }),
    requireAdmin,
    validate(CATEGORY_SCHEMA),
    AdminController.createCategory
  );

  router.put('/categories/:id',
    authMiddleware({ required: true }),
    requireAdmin,
    validate(CATEGORY_SCHEMA),
    AdminController.updateCategory
  );

  router.delete('/categories/:id',
    authMiddleware({ required: true }),
    requireAdmin,
    AdminController.deleteCategory
  );

  router.put('/users/:id/role',
    authMiddleware({ required: true }),
    requireAdmin,
    validate(ROLE_SCHEMA),
    AdminController.updateUserRole
  );

  router.put('/posts/:id/pin',
    authMiddleware({ required: true }),
    requireModerator,
    AdminController.pinPost
  );

  router.put('/posts/:id/move',
    authMiddleware({ required: true }),
    requireModerator,
    AdminController.movePost
  );

  router.get('/logs',
    authMiddleware({ required: true }),
    requireAdmin,
    AdminController.getLogs
  );

  return router;
}

module.exports = createRoutes();
module.exports.createRoutes = createRoutes;
