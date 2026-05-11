const Router = require('@koa/router');
const authRoutes = require('./auth.routes');
const { createRoutes: createAuthRoutes } = require('./auth.routes');
const postRoutes = require('./post.routes');
const { createRoutes: createPostRoutes } = require('./post.routes');
const { router: replyRoutes, replyRouter } = require('./reply.routes');
const { createPostRoutes: createReplyPostRoutes, createReplyRoutes } = require('./reply.routes');
const categoryRoutes = require('./category.routes');
const { createRoutes: createCategoryRoutes } = require('./category.routes');
const tagRoutes = require('./tag.routes');
const { createRoutes: createTagRoutes } = require('./tag.routes');
const adminRoutes = require('./admin.routes');
const { createRoutes: createAdminRoutes } = require('./admin.routes');

const router = new Router();

// API version header middleware (must be before routes)
router.use(async (ctx, next) => {
  if (ctx.path.startsWith('/api/v1/')) {
    ctx.set('X-API-Version', '1');
  } else if (ctx.path.startsWith('/api/')) {
    ctx.set('X-API-Version', 'legacy');
  }
  return next();
});

// Legacy routes (prefix: /api)
router.use(authRoutes.routes());
router.use(postRoutes.routes());
router.use(replyRoutes.routes());
router.use(replyRouter.routes());
router.use(categoryRoutes.routes());
router.use(tagRoutes.routes());
router.use(adminRoutes.routes());

// v1 routes (mounted directly, factory creates full paths like /api/v1/posts)
router.use(createAuthRoutes('/api/v1').routes());
router.use(createPostRoutes('/api/v1').routes());
router.use(createReplyPostRoutes('/api/v1').routes());
router.use(createReplyRoutes('/api/v1').routes());
router.use(createCategoryRoutes('/api/v1').routes());
router.use(createTagRoutes('/api/v1').routes());
router.use(createAdminRoutes('/api/v1').routes());

module.exports = router;
