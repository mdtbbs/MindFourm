const Router = require('@koa/router');
const { authMiddleware } = require('../middleware/auth');
const { requireOwnershipOrPermission } = require('../middleware/permission');
const { createDynamicRateLimit } = require('../middleware/rate-limit');
const ReplyController = require('../controllers/reply.controller');
const ReplyService = require('../services/reply.service');

function validateReply() {
  return (ctx, next) => {
    const { validate } = require('../middleware/validate');
    const { getReplySchema } = require('../validators/common.validator');
    return validate(getReplySchema())(ctx, next);
  };
}

function createPostRoutes(basePrefix = '/api') {
  const router = new Router({ prefix: `${basePrefix}/posts` });

  router.get('/:postId/replies', ReplyController.list);

  router.post('/:postId/replies',
    authMiddleware({ required: true, roles: ['user', 'moderator', 'admin'] }),
    createDynamicRateLimit('reply_create', 'rate_reply_max', 'rate_reply_window_min', { max: 30, windowMin: 60 }),
    validateReply(),
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
    validateReply(),
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
