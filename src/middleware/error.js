async function errorHandler(ctx, next) {
  try {
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = {
      success: false,
      message: err.message || 'Internal server error',
      code: err.code || null
    };

    if (ctx.status === 500) {
      console.error(`[${new Date().toISOString()}] ${ctx.method} ${ctx.path} —`, err);
    }
  }
}

module.exports = { errorHandler };