const Response = require('../utils/response');
const BanService = require('../services/ban.service');

const banCheck = async (ctx, next) => {
  const ip = ctx.ip;

  if (BanService.checkIp(ip)) {
    return Response.error(ctx, 'Access denied', 403, 'BANNED');
  }

  if (ctx.state.user) {
    const userId = String(ctx.state.user.id);
    if (BanService.isActive('user', userId)) {
      return Response.error(ctx, 'Account banned', 403, 'BANNED');
    }
  }

  return next();
};

module.exports = banCheck;
