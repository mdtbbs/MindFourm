const Router = require('@koa/router');
const AttachmentController = require('../controllers/attachment.controller');
const { attachmentUpload } = require('../middleware/upload');
const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/permission');

function createRoutes(basePath) {
  const router = new Router();

  router.post(`${basePath}/attachments/upload`, authMiddleware, attachmentUpload, AttachmentController.upload);
  router.get(`${basePath}/attachments/post/:postId`, AttachmentController.getByPost);
  router.get(`${basePath}/attachments/:id/download`, AttachmentController.download);
  router.delete(`${basePath}/attachments/:id`, authMiddleware, requireRole(['admin', 'moderator']), AttachmentController.deleteFile);

  return router;
}

module.exports = { createRoutes };
