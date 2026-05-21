const ServerService = require('../services/server.service');
const Response = require('../utils/response');

class ServerController {
  /**
   * 获取公开服务器列表
   */
  static async getPublicServers(ctx) {
    const servers = await ServerService.getPublicServers();
    Response.success(ctx, { servers: servers || [] });
  }

  /**
   * 获取用户服务器列表
   */
  static async getUserServers(ctx) {
    const mindauthId = ctx.state.user.mindauthId;
    const servers = await ServerService.getUserServers(mindauthId);
    Response.success(ctx, { servers: servers || [] });
  }

  /**
   * 获取服务器详情
   */
  static async getServerBasic(ctx) {
    const serverId = parseInt(ctx.params.id);
    const server = await ServerService.getServerBasic(serverId);

    if (!server) {
      ctx.status = 404;
      ctx.body = { success: false, message: '服务器不存在' };
      return;
    }

    Response.success(ctx, { server });
  }

  /**
   * 申请创建服务器
   */
  static async applyServer(ctx) {
    const { name, description, version, template_id } = ctx.request.body;
    const mindauthId = ctx.state.user.mindauthId;

    // 基础验证
    if (!name || name.trim().length < 2) {
      ctx.status = 400;
      ctx.body = { success: false, message: '服务器名称至少2个字符' };
      return;
    }

    if (!version) {
      ctx.status = 400;
      ctx.body = { success: false, message: '请选择服务器版本' };
      return;
    }

    // 调用 EasyManager 申请
    const result = await ServerService.applyServer(mindauthId, {
      name,
      description,
      version,
      template_id
    });

    if (result.success) {
      Response.success(ctx, {
        server_id: result.server_id,
        message: result.message
      });
    } else {
      ctx.status = 400;
      ctx.body = { success: false, message: result.message };
    }
  }

  /**
   * 获取可用版本列表
   */
  static async getVersions(ctx) {
    const versions = await ServerService.getAvailableVersions();
    Response.success(ctx, { versions: versions || [] });
  }

  /**
   * 获取可用模板列表
   */
  static async getTemplates(ctx) {
    const templates = await ServerService.getPublicTemplates();
    Response.success(ctx, { templates: templates || [] });
  }
}

module.exports = ServerController;