const Router = require('@koa/router');
const SettingService = require('../services/setting.service');
const Response = require('../utils/response');
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

// Public settings (no auth) — returns only non-sensitive settings
const PUBLIC_SETTING_KEYS = [
  'site_name', 'site_tagline', 'site_description', 'site_logo_url', 'site_footer',
  'announce_enabled', 'announce_content',
  'posts_per_page', 'default_sort', 'replies_per_page',
  'seo_title_suffix', 'seo_default_description', 'seo_og_image', 'seo_sitemap_enabled', 'seo_robots_enabled',
];

router.get('/api/settings', async (ctx) => {
  const all = SettingService.getAll();
  const publicSettings = {};
  for (const key of PUBLIC_SETTING_KEYS) {
    publicSettings[key] = all[key] ?? null;
  }
  Response.success(ctx, publicSettings);
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
