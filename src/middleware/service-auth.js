const config = require('../config');

module.exports = async (ctx, next) => {
  const serviceKey = ctx.headers['x-service-key'];
  const expectedKey = config.easymanager?.apiKey || process.env.EASYMANAGER_API_KEY;

  if (!serviceKey || serviceKey !== expectedKey) {
    ctx.status = 401;
    ctx.body = { success: false, message: '服务认证失败' };
    return;
  }

  await next();
};