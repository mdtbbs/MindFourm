const Router = require('@koa/router');
const AutoPostService = require('../services/auto-post.service');
const Response = require('../utils/response');
const requireServiceAuth = require('../middleware/service-auth');

const router = new Router({ prefix: '/api/auto-post' });

// 接收 EasyManager 回调创建帖子
router.post('/server-approved', requireServiceAuth, async ctx => {
  const data = ctx.request.body;

  if (!data.type || !data.server_id || !data.server_name || !data.owner_id) {
    ctx.status = 400;
    ctx.body = { success: false, message: '缺少必要参数' };
    return;
  }

  const result = await AutoPostService.createServerAnnouncement(data);

  if (result.success) {
    Response.success(ctx, { post_id: result.post_id });
  } else {
    ctx.status = 500;
    ctx.body = { success: false, message: result.message };
  }
});

module.exports = router;