const Router = require('@koa/router');
const CategoryController = require('../controllers/category.controller');

function createRoutes(basePrefix = '/api') {
  const router = new Router({ prefix: `${basePrefix}/categories` });

  router.get('/', CategoryController.list);
  router.get('/:id', CategoryController.getById);

  return router;
}

module.exports = createRoutes();
module.exports.createRoutes = createRoutes;
