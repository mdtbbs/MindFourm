async function errorHandler(ctx, next) {
  try {
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = {
      success: false,
      message: err.message || 'Internal server error'
    };

    if (ctx.status === 500) {
      console.error('Server error:', err);
    }
  }
}

module.exports = { errorHandler };