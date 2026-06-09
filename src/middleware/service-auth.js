const crypto = require('crypto');
const config = require('../config');

function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

module.exports = async (ctx, next) => {
  const serviceKey = ctx.headers['x-service-key'];
  const expectedKey = config.easymanager?.apiKey || process.env.EASYMANAGER_API_KEY;

  if (!expectedKey || !serviceKey || !timingSafeCompare(serviceKey, expectedKey)) {
    ctx.status = 401;
    ctx.body = { success: false, message: '服务认证失败' };
    return;
  }

  await next();
};
