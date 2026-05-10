const Router = require('@koa/router');
const CategoryController = require('../controllers/category.controller');

const router = new Router({ prefix: '/api/categories' });

router.get('/', CategoryController.list);
router.get('/:id', CategoryController.getById);

module.exports = router;