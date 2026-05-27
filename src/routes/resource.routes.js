const Router = require('@koa/router');
const { koaBody } = require('koa-body');
const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/permission');
const ResourceController = require('../controllers/resource.controller');
const ResourceCategoryService = require('../services/resource-category.service');

const resourceUpload = koaBody({
  multipart: true,
  formidable: {
    maxFileSize: 50 * 1024 * 1024,
    maxFields: 10,
  },
  parsedMethods: ['POST'],
});

function createRoutes(basePrefix = '/api') {
  const prefix = `${basePrefix}/resources`;
  const router = new Router({ prefix });

  // Public
  router.get('/', ResourceController.list);
  router.get('/categories', ResourceController.listCategories);
  router.get('/admin', authMiddleware({ required: true }), requireRole(['admin', 'moderator']), ResourceController.listAll);
  router.get('/:id', ResourceController.getById);
  router.get('/:id/download', authMiddleware({ required: true }), ResourceController.download);
  router.get('/:id/versions', ResourceController.listVersions);

  // Authenticated
  router.post('/', authMiddleware({ required: true }), async (ctx, next) => {
    // Handle both multipart (FormData from frontend) and JSON (from global bodyParser)
    const contentType = ctx.request.type || '';
    if (contentType.includes('multipart')) {
      return resourceUpload(ctx, next);
    }
    return next();
  }, ResourceController.upload);
  router.put('/:id', authMiddleware({ required: true }), async (ctx, next) => {
    // Handle multipart for optional file upload, fallback to JSON body
    const contentType = ctx.request.type || '';
    if (contentType.includes('multipart')) {
      return resourceUpload(ctx, next);
    }
    return next();
  }, ResourceController.update);
  router.delete('/:id', authMiddleware({ required: true }), ResourceController.deleteResource);
  router.post('/:id/versions', authMiddleware({ required: true }), async (ctx, next) => {
    const contentType = ctx.request.type || '';
    if (contentType.includes('multipart')) {
      return resourceUpload(ctx, next);
    }
    return next();
  }, ResourceController.addVersion);

  // Admin/Moderator
  router.put('/:id/status', authMiddleware({ required: true }), requireRole(['admin', 'moderator']), ResourceController.updateStatus);
  router.delete('/:id/admin', authMiddleware({ required: true }), requireRole(['admin', 'moderator']), ResourceController.adminDelete);

  // Category management (admin only)
  router.post('/categories', authMiddleware({ required: true }), requireRole(['admin']), async (ctx) => {
    const cat = ResourceCategoryService.create(ctx.request.body);
    ctx.body = { success: true, data: cat };
  });
  router.put('/categories/:id', authMiddleware({ required: true }), requireRole(['admin']), async (ctx) => {
    const cat = ResourceCategoryService.update(parseInt(ctx.params.id), ctx.request.body);
    ctx.body = { success: true, data: cat };
  });
  router.delete('/categories/:id', authMiddleware({ required: true }), requireRole(['admin']), async (ctx) => {
    const result = ResourceCategoryService.delete(parseInt(ctx.params.id));
    if (result.error) {
      ctx.status = 400;
      return ctx.body = { success: false, message: result.error };
    }
    ctx.body = { success: true, data: result };
  });

  return router;
}

module.exports = { createRoutes };
