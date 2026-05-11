const Router = require('@koa/router');
const { authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { requireOwnershipOrPermission } = require('../middleware/permission');
const { REPLY_SCHEMA } = require('../validators/common.validator');
const ReplyController = require('../controllers/reply.controller');
const ReplyService = require('../services/reply.service');

function createPostRoutes(basePrefix = '/api') {
  const router = new Router({ prefix: `${basePrefix}/posts` });

  router.get('/:postId/replies', ReplyController.list);

  router.post('/:postId/replies',
    authMiddleware({ required: true, roles: ['user', 'moderator', 'admin'] }),
    validate(REPLY_SCHEMA),
    ReplyController.create
  );

  return router;
}

function createReplyRoutes(basePrefix = '/api') {
  const replyRouter = new Router({ prefix: `${basePrefix}/replies` });

  replyRouter.put('/:id',
    authMiddleware({ required: true }),
    requireOwnershipOrPermission('REPLY_EDIT_ANY', (ctx) => {
      const reply = ReplyService.getById(parseInt(ctx.params.id));
      return reply?.user_id;
    }),
    validate(REPLY_SCHEMA),
    ReplyController.update
  );

  replyRouter.delete('/:id',
    authMiddleware({ required: true }),
    requireOwnershipOrPermission('REPLY_DELETE_ANY', (ctx) => {
      const reply = ReplyService.getById(parseInt(ctx.params.id));
      return reply?.user_id;
    }),
    ReplyController.delete
  );

  return replyRouter;
}

module.exports = {
  router: createPostRoutes(),
  replyRouter: createReplyRoutes(),
  createPostRoutes,
  createReplyRoutes
};
