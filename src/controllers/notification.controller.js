const Response = require('../utils/response');
const NotificationService = require('../services/notification.service');

class NotificationController {
  static list(ctx) {
    const { page, limit } = ctx.query;
    const result = NotificationService.getByUserId(ctx.state.user.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50
    });
    Response.paginated(ctx, result.data, result.pagination);
  }

  static unreadCount(ctx) {
    const count = NotificationService.getUnreadCount(ctx.state.user.id);
    Response.success(ctx, { count });
  }

  static markAsRead(ctx) {
    const id = parseInt(ctx.params.id);
    if (isNaN(id)) {
      Response.error(ctx, 'Invalid notification ID', 400);
      return;
    }
    NotificationService.markAsRead(id, ctx.state.user.id);
    Response.success(ctx, { message: 'Marked as read' });
  }

  static markAllAsRead(ctx) {
    NotificationService.markAllAsRead(ctx.state.user.id);
    Response.success(ctx, { message: 'All marked as read' });
  }

  static listCursor(ctx) {
    const { limit, cursor } = ctx.query;
    const result = NotificationService.getByUserIdCursor(ctx.state.user.id, {
      limit: parseInt(limit) || 50,
      cursor: cursor || null,
    });
    Response.success(ctx, { data: result.data, next_cursor: result.next_cursor, has_more: result.has_more });
  }
}

module.exports = NotificationController;
