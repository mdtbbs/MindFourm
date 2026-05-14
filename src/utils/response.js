class Response {
  static success(ctx, data, status = 200) {
    ctx.status = status;
    ctx.body = { success: true, data };
  }

  static created(ctx, data) {
    this.success(ctx, data, 201);
  }

  static paginated(ctx, data, pagination) {
    ctx.status = 200;
    ctx.body = { success: true, data, pagination };
  }

  static error(ctx, message, status = 400, code = null, details = null) {
    ctx.status = status;
    ctx.body = { success: false, message, code };
    if (details) ctx.body.details = details;
  }

  static unauthorized(ctx, message = 'Unauthorized') {
    this.error(ctx, message, 401);
  }

  static forbidden(ctx, message = 'Forbidden') {
    this.error(ctx, message, 403);
  }

  static notFound(ctx, message = 'Resource not found') {
    this.error(ctx, message, 404);
  }

  static serverError(ctx, message = 'Internal server error') {
    this.error(ctx, message, 500);
  }
}

module.exports = Response;