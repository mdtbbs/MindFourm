const path = require('path');
const fs = require('fs');
const ResourceService = require('../services/resource.service');
const LogService = require('../services/log.service');
const Response = require('../utils/response');

const UPLOAD_DIR = path.join(__dirname, '../uploads/resources');

class ResourceController {
  static async upload(ctx) {
    const user = ctx.state.user;
    if (!user) {
      ctx.status = 401;
      return Response.error(ctx, '未登录');
    }

    const file = ctx.request.files?.file;
    if (!file) {
      ctx.status = 400;
      return Response.error(ctx, '请选择文件');
    }

    const { title, description, category, is_public } = ctx.request.body;
    if (!title) {
      ctx.status = 400;
      return Response.error(ctx, '标题不能为空');
    }

    const resourceFile = Array.isArray(file) ? file[0] : file;
    const safeName = path.basename(resourceFile.originalFilename || 'upload');
    const ext = path.extname(safeName);
    const fileName = `resource_${Date.now()}${ext}`;
    const destPath = path.join(UPLOAD_DIR, fileName);

    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    fs.copyFileSync(resourceFile.filepath, destPath);
    fs.unlinkSync(resourceFile.filepath);

    const resource = ResourceService.create({
      user_id: user.id,
      title: title.trim(),
      description: description?.trim(),
      file_name: safeName,
      file_path: `uploads/resources/${fileName}`,
      file_size: resourceFile.size,
      mime_type: resourceFile.mimetype,
      category: category || null,
      is_public: is_public === 'true' || is_public === '1',
    });

    LogService.log({
      user_id: user.id,
      action: 'RESOURCE_UPLOAD',
      target_type: 'resource',
      target_id: resource.id,
      ip_address: ctx.ip,
      user_agent: ctx.headers['user-agent'],
    });

    Response.created(ctx, resource);
  }

  static list(ctx) {
    const { limit, cursor, category, search } = ctx.query;
    const result = ResourceService.getList({
      limit: parseInt(limit) || 20,
      cursor: cursor || null,
      category: category || null,
      search: search || null,
      status: 'approved',
    });
    Response.success(ctx, { data: result.data, next_cursor: result.next_cursor, has_more: result.has_more });
  }

  static getById(ctx) {
    const resource = ResourceService.getById(parseInt(ctx.params.id));
    if (!resource) {
      ctx.status = 404;
      return Response.error(ctx, '资源不存在');
    }
    Response.success(ctx, resource);
  }

  static download(ctx) {
    const resource = ResourceService.getById(parseInt(ctx.params.id));
    if (!resource) {
      ctx.status = 404;
      return Response.error(ctx, '资源不存在');
    }

    ResourceService.incrementDownload(resource.id);

    const fullPath = path.join(__dirname, '..', resource.file_path);
    if (!fs.existsSync(fullPath)) {
      ctx.status = 404;
      return Response.error(ctx, '文件已丢失');
    }

    ctx.set('Content-Disposition', `attachment; filename="${encodeURIComponent(resource.file_name)}"`);
    ctx.set('Content-Type', resource.mime_type);
    ctx.body = fs.createReadStream(fullPath);
  }

  static deleteResource(ctx) {
    const user = ctx.state.user;
    if (!user) {
      ctx.status = 401;
      return Response.error(ctx, '未登录');
    }

    const resource = ResourceService.getById(parseInt(ctx.params.id));
    if (!resource || (resource.user_id !== user.id && user.role !== 'admin')) {
      ctx.status = 403;
      return Response.error(ctx, '无权限');
    }

    ResourceService.delete(resource.id);
    Response.success(ctx, { message: '资源已删除' });
  }

  static getCategories(ctx) {
    const categories = ResourceService.getCategories();
    Response.success(ctx, categories);
  }

  // Admin methods
  static listAll(ctx) {
    const { limit, cursor, category, search, status } = ctx.query;
    const result = ResourceService.getList({
      limit: parseInt(limit) || 20,
      cursor: cursor || null,
      category: category || null,
      search: search || null,
      status: status || null,
    });
    Response.success(ctx, { data: result.data, next_cursor: result.next_cursor, has_more: result.has_more });
  }

  static updateStatus(ctx) {
    const { status } = ctx.request.body;
    const resource = ResourceService.updateStatus(parseInt(ctx.params.id), status);
    if (!resource) {
      ctx.status = 404;
      return Response.error(ctx, '资源不存在');
    }
    Response.success(ctx, resource);
  }
}

module.exports = ResourceController;
