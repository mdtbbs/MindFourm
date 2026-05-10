const Router = require('@koa/router');
const TagController = require('../controllers/tag.controller');

const router = new Router({ prefix: '/api/tags' });

router.get('/', TagController.list);
router.get('/:slug/posts', TagController.getPostsByTag);

module.exports = router;