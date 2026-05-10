const Router = require('@koa/router');
const { authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { requireOwnershipOrPermission } = require('../middleware/permission');
const { POST_SCHEMA } = require('../validators/common.validator');
const PostController = require('../controllers/post.controller');
const PostService = require('../services/post.service');

const router = new Router({ prefix: '/api/posts' });

router.get('/', PostController.list);
router.get('/:id', PostController.getById);

router.post('/',
  authMiddleware({ required: true, roles: ['user', 'moderator', 'admin'] }),
  validate(POST_SCHEMA),
  PostController.create
);

router.put('/:id',
  authMiddleware({ required: true }),
  requireOwnershipOrPermission('POST_EDIT_ANY', (ctx) => {
    const post = PostService.getById(parseInt(ctx.params.id));
    return post?.user_id;
  }),
  validate(POST_SCHEMA),
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

module.exports = router;