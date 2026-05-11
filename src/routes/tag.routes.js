const Router = require('@koa/router');
const TagController = require('../controllers/tag.controller');

function createRoutes(basePrefix = '/api') {
  const router = new Router({ prefix: `${basePrefix}/tags` });

  router.get('/', TagController.list);
  router.get('/:slug/posts', TagController.getPostsByTag);

  return router;
}

module.exports = createRoutes();
module.exports.createRoutes = createRoutes;
