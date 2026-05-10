const Router = require('@koa/router');
const authRoutes = require('./auth.routes');
const postRoutes = require('./post.routes');
const { router: replyRoutes, replyRouter } = require('./reply.routes');
const categoryRoutes = require('./category.routes');
const tagRoutes = require('./tag.routes');
const adminRoutes = require('./admin.routes');

const router = new Router();

router.use(authRoutes.routes());
router.use(postRoutes.routes());
router.use(replyRoutes.routes());
router.use(replyRouter.routes());
router.use(categoryRoutes.routes());
router.use(tagRoutes.routes());
router.use(adminRoutes.routes());

module.exports = router;