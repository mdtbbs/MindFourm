const Response = require('../utils/response');
const NotificationService = require('../services/notification.service');

class NotificationController {
  static async list(ctx) {
    const { page, limit } = ctx.query;
    const result = await NotificationService.getByUserId(ctx.state.user.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50
    });
    Response.paginated(ctx, result.data, result.pagination);
  }

  static async unreadCount(ctx) {
    const count = await NotificationService.getUnreadCount(ctx.state.user.id);
    Response.success(ctx, { count });
  }

  static async markAsRead(ctx) {
    const id = parseInt(ctx.params.id);
    if (isNaN(id)) {
      Response.error(ctx, 'Invalid notification ID', 400);
      return;
    }
    await NotificationService.markAsRead(id, ctx.state.user.id);
    Response.success(ctx, { message: 'Marked as read' });
  }

  static async markAllAsRead(ctx) {
    await NotificationService.markAllAsRead(ctx.state.user.id);
    Response.success(ctx, { message: 'All marked as read' });
  }

  static async listCursor(ctx) {
    const { limit, cursor } = ctx.query;
    const result = await NotificationService.getByUserIdCursor(ctx.state.user.id, {
      limit: parseInt(limit) || 50,
      cursor: cursor || null,
    });
    Response.success(ctx, { data: result.data, next_cursor: result.next_cursor, has_more: result.has_more });
  }
}

module.exports = NotificationController;