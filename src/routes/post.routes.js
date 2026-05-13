const Router = require('@koa/router');
const { authMiddleware } = require('../middleware/auth');
const { requireOwnershipOrPermission } = require('../middleware/permission');
const PostController = require('../controllers/post.controller');
const PostService = require('../services/post.service');

function validatePost() {
  return (ctx, next) => {
    const { validate } = require('../middleware/validate');
    const { getPostSchema } = require('../validators/common.validator');
    return validate(getPostSchema())(ctx, next);
  };
}

function createRoutes(basePrefix = '/api') {
  const router = new Router({ prefix: `${basePrefix}/posts` });

  router.get('/', PostController.list);
  router.get('/:id', PostController.getById);

  router.post('/',
    authMiddleware({ required: true, roles: ['user', 'moderator', 'admin'] }),
    validatePost(),
    PostController.create
  );

  router.put('/:id',
    authMiddleware({ required: true }),
    requireOwnershipOrPermission('POST_EDIT_ANY', (ctx) => {
      const post = PostService.getById(parseInt(ctx.params.id));
      return post?.user_id;
    }),
    validatePost(),
    PostController.update
  );

  router.delete('/:id',
    authMiddleware({ required: true }),
    requireOwnershipOrPermission('POST_DELETE_ANY', (ctx) => {
      const post = PostService.getById(parseInt(ctx.params.id));
      return post?.user_id;
    }),
    PostController.delete
  );

  return router;
}

module.exports = createRoutes();
module.exports.createRoutes = createRoutes;
