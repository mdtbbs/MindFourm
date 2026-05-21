const Router = require('@koa/router');
const PostServerService = require('../services/post-server.service');
const Response = require('../utils/response');
const { authMiddleware } = require('../middleware/auth');
const requireServiceAuth = require('../middleware/service-auth');
const ServerService = require('../services/server.service');

function createRoutes(prefix = '/api/v1') {
  const router = new Router({ prefix: `${prefix}/post-servers` });

  // 获取服务器关联的帖子（公开）
  router.get('/by-server/:serverId', async ctx => {
    const serverId = parseInt(ctx.params.serverId);
    const posts = PostServerService.getPostsByServer(serverId);
    Response.success(ctx, { posts });
  });

  // 获取用户可关联的服务器（需要认证）
  router.get('/my-servers', authMiddleware({ required: true }), async ctx => {
    const mindauthId = ctx.state.user.mindauthId;
    const servers = await ServerService.getUserServers(mindauthId);
    Response.success(ctx, { servers });
  });

  // EasyManager 查询帖子（服务认证）
  router.get('/forum-posts/:serverId', requireServiceAuth, async ctx => {
    const serverId = parseInt(ctx.params.serverId);
    const posts = PostServerService.getPostsByServer(serverId);
    Response.success(ctx, { posts });
  });

  return router;
}

module.exports = createRoutes();
module.exports.createRoutes = createRoutes;