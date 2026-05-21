const Router = require('@koa/router');
const { koaBody } = require('koa-body');
const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/permission');
const ResourceController = require('../controllers/resource.controller');

const resourceUpload = koaBody({
  multipart: true,
  formidable: {
    maxFileSize: 50 * 1024 * 1024, // 50MB for resources
    maxFields: 1,
  },
  parsedMethods: ['POST'],
});

function createRoutes(basePrefix = '/api') {
  const router = new Router({ prefix: `${basePrefix}/resources` });

  // Public
  router.get('/', ResourceController.list);
  router.get('/categories', ResourceController.getCategories);
  router.get('/:id', ResourceController.getById);
  router.get('/:id/download', ResourceController.download);

  // Authenticated
  router.post('/', authMiddleware({ required: true }), resourceUpload, ResourceController.upload);
  router.delete('/:id', authMiddleware({ required: true }), ResourceController.deleteResource);

  // Admin
  router.get('/admin', authMiddleware({ required: true }), requireRole(['admin', 'moderator']), ResourceController.listAll);
  router.put('/:id/status', authMiddleware({ required: true }), requireRole(['admin', 'moderator']), ResourceController.updateStatus);

  return router;
}

module.exports = { createRoutes };
