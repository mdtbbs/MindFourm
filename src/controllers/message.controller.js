const Response = require('../utils/response');
const MessageService = require('../services/message.service');
const LogService = require('../services/log.service');
const { LOG_ACTIONS } = require('../utils/constants');

class MessageController {
  static async send(ctx) {
    const sender = ctx.state.user;
    const { recipient_id, content } = ctx.request.body;

    if (!recipient_id || !content) {
      ctx.status = 400;
      return Response.error(ctx, '收件人和内容不能为空');
    }

    const message = await MessageService.create({
      sender_id: sender.id,
      recipient_id: parseInt(recipient_id),
      content,
    });

    if (!message) {
      ctx.status = 400;
      return Response.error(ctx, '不能给自己发私信');
    }

    await LogService.log({
      user_id: sender.id,
      action: 'MESSAGE_SEND',
      target_type: 'message',
      target_id: message.id,
      ip_address: ctx.ip,
      user_agent: ctx.headers['user-agent'],
    });

    Response.created(ctx, message);
  }

  static async getConversations(ctx) {
    const { limit, cursor } = ctx.query;
    const result = await MessageService.getConversations(ctx.state.user.id, {
      limit: parseInt(limit) || 20,
      cursor: cursor || null,
    });
    Response.success(ctx, { data: result.data, next_cursor: result.next_cursor, has_more: result.has_more });
  }

  static async getConversation(ctx) {
    const { limit, cursor } = ctx.query;
    const otherUserId = parseInt(ctx.params.userId);
    const result = await MessageService.getConversation(ctx.state.user.id, otherUserId, {
      limit: parseInt(limit) || 50,
      cursor: cursor || null,
    });
    Response.success(ctx, { data: result.data, next_cursor: result.next_cursor, has_more: result.has_more });
  }

  static async unreadCount(ctx) {
    const count = await MessageService.getUnreadCount(ctx.state.user.id);
    Response.success(ctx, { count });
  }

  static async deleteMessage(ctx) {
    const user = ctx.state.user;
    const messageId = parseInt(ctx.params.id);
    const message = await MessageService.getById(messageId);

    if (!message) {
      ctx.status = 404;
      return Response.error(ctx, '消息不存在');
    }

    const isSender = message.sender_id === user.id;
    const isRecipient = message.recipient_id === user.id;
    if (!isSender && !isRecipient) {
      ctx.status = 403;
      return Response.error(ctx, '无权限');
    }

    await MessageService.deleteForUser(messageId, user.id, isSender);
    Response.success(ctx, { message: '已删除' });
  }
}

module.exports = MessageController;