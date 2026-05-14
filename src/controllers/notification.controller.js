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
    NotificationService.markAsRead(parseInt(ctx.params.id), ctx.state.user.id);
    Response.success(ctx, { message: 'Marked as read' });
  }

  static markAllAsRead(ctx) {
    NotificationService.markAllAsRead(ctx.state.user.id);
    Response.success(ctx, { message: 'All marked as read' });
  }
}

module.exports = NotificationController;
