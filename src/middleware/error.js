function getRequestId(ctx) {
  return ctx.get('x-request-id') || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function errorHandler(ctx, next) {
  try {
    await next();
  } catch (err) {
    const status = err.status || 500;
    const requestId = getRequestId(ctx);
    ctx.status = status;
    ctx.set('X-Request-Id', requestId);

    const isProduction = process.env.NODE_ENV === 'production';
    const message = status >= 500 && isProduction
      ? 'Internal server error'
      : (err.message || 'Internal server error');

    ctx.body = {
      success: false,
      message,
      code: err.code || null,
      request_id: requestId,
    };

    if (status >= 500) {
      console.error(`[${new Date().toISOString()}] ${ctx.method} ${ctx.path} ${requestId} —`, err);
    }
  }
}

module.exports = { errorHandler };
