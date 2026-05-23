const path = require('path');
const fs = require('fs');
const ResourceService = require('../services/resource.service');
const ResourceCategoryService = require('../services/resource-category.service');
const ResourceVersionService = require('../services/resource-version.service');
const LogService = require('../services/log.service');
const Response = require('../utils/response');
const { parseMarkdown } = require('../utils/markdown');

const UPLOAD_DIR = path.join(__dirname, '../uploads/resources');

class ResourceController {
  static async upload(ctx) {
    const user = ctx.state.user;
    if (!user) {
      ctx.status = 401;
      return Response.error(ctx, '未登录');
    }

    const { title, description, resource_type, version, content, category_id, is_public, external_url } = ctx.request.body || {};
    if (!title || title.trim().length < 2 || title.trim().length > 200) {
      ctx.status = 400;
      return Response.error(ctx, '标题至少2个字符，最多200个字符');
    }
    if (resource_type && !['file', 'external'].includes(resource_type)) {
      ctx.status = 400;
      return Response.error(ctx, '无效的资源类型');
    }
    if (version && version.length > 50) {
      ctx.status = 400;
      return Response.error(ctx, '版本号最多50个字符');
    }

    let file_name = null, file_path = null, file_size = 0, mime_type = null;

    if (resource_type === 'external') {
      if (!external_url || external_url.trim().length === 0) {
        ctx.status = 400;
        return Response.error(ctx, '外链地址不能为空');
      }
      if (!/^https?:\/\//.test(external_url.trim())) {
        ctx.status = 400;
        return Response.error(ctx, '外链地址必须以 http:// 或 https:// 开头');
      }
    } else {
      const file = ctx.request.files?.file;
      if (!file) {
        ctx.status = 400;
        return Response.error(ctx, '请选择文件');
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

      file_name = safeName;
      file_path = `uploads/resources/${fileName}`;
      file_size = resourceFile.size;
      mime_type = resourceFile.mimetype;
    }

    const display_name = file_name || (external_url ? path.basename(external_url) || 'external-link' : '');
    const display_path = file_path || external_url || '';
    const display_mime = mime_type || 'application/octet-stream';

    const content_html = content ? parseMarkdown(content) : '';

    const resource = await ResourceService.create({
      user_id: user.id,
      title: title.trim(),
      description: description?.trim(),
      resource_type: resource_type || 'file',
      file_name: display_name, file_path: display_path, file_size: file_size || 0, mime_type: display_mime,
      external_url: external_url || null,
      version: version || null,
      content: content || null,
      content_html,
      category_id: category_id ? parseInt(category_id) : null,
      is_public: is_public === 'true' || is_public === '1' || is_public === true,
    });

    await LogService.log({
      user_id: user.id,
      action: 'RESOURCE_UPLOAD',
      target_type: 'resource',
      target_id: resource.id,
      ip_address: ctx.ip,
      user_agent: ctx.headers['user-agent'],
    });

    Response.created(ctx, resource);
  }

  static async list(ctx) {
    const { limit, cursor, category_id, search, sort } = ctx.query;
    const result = await ResourceService.getList({
      limit: parseInt(limit) || 20,
      cursor: cursor || null,
      category_id: category_id || null,
      search: search || null,
      status: 'approved',
      sort: sort || null,
    });
    Response.success(ctx, { data: result.data, next_cursor: result.next_cursor, has_more: result.has_more });
  }

  static async getById(ctx) {
    const data = await ResourceService.getByResourceIdWithVersions(parseInt(ctx.params.id));
    if (!data) {
      ctx.status = 404;
      return Response.error(ctx, '资源不存在');
    }
    Response.success(ctx, data);
  }

  static async download(ctx) {
    const resource = await ResourceService.getById(parseInt(ctx.params.id));
    if (!resource || resource.resource_type !== 'file') {
      return Response.error(ctx, '资源不存在或不可下载', 404);
    }

    await ResourceService.incrementDownload(resource.id);

    const fullPath = path.join(__dirname, '..', resource.file_path);
    if (!fs.existsSync(fullPath)) {
      return Response.error(ctx, '文件已丢失', 404);
    }

    ctx.set('Content-Disposition', `attachment; filename="${encodeURIComponent(resource.file_name)}"`);
    ctx.set('Content-Type', resource.mime_type);
    ctx.body = fs.createReadStream(fullPath);
  }

  static async update(ctx) {
    const user = ctx.state.user;
    if (!user) {
      ctx.status = 401;
      return Response.error(ctx, '未登录');
    }

    const { title, description, version, content, category_id, is_public, external_url } = ctx.request.body;
    const content_html = content ? parseMarkdown(content) : undefined;

    const resource = await ResourceService.update(parseInt(ctx.params.id), user.id, {
      title, description, version, content, content_html, category_id, is_public, external_url,
    });

    if (!resource) {
      ctx.status = 403;
      return Response.error(ctx, '无权限');
    }

    Response.success(ctx, resource);
  }

  static async deleteResource(ctx) {
    const user = ctx.state.user;
    if (!user) {
      ctx.status = 401;
      return Response.error(ctx, '未登录');
    }

    const result = await ResourceService.delete(parseInt(ctx.params.id), user.id);
    if (!result) {
      ctx.status = 403;
      return Response.error(ctx, '无权限或资源不存在');
    }

    Response.success(ctx, { message: '资源已删除' });
  }

  static async listCategories(ctx) {
    const includeInactive = ctx.state.user?.role === 'admin' || ctx.state.user?.role === 'moderator';
    const categories = await ResourceCategoryService.list(includeInactive);
    Response.success(ctx, categories);
  }

  static async listVersions(ctx) {
    const versions = await ResourceVersionService.list(parseInt(ctx.params.id));
    Response.success(ctx, { versions });
  }

  static async addVersion(ctx) {
    const user = ctx.state.user;
    if (!user) {
      ctx.status = 401;
      return Response.error(ctx, '未登录');
    }

    const { version } = ctx.request.body;
    if (!version) {
      ctx.status = 400;
      return Response.error(ctx, '版本号不能为空');
    }

    const resource = await ResourceService.getById(parseInt(ctx.params.id));
    if (!resource || (resource.user_id !== user.id && user.role !== 'admin')) {
      ctx.status = 403;
      return Response.error(ctx, '无权限');
    }

    let file_path = null;
    const file = ctx.request.files?.file;
    if (file) {
      const resourceFile = Array.isArray(file) ? file[0] : file;
      const safeName = path.basename(resourceFile.originalFilename || 'upload');
      const ext = path.extname(safeName);
      const fileName = `resource_v${Date.now()}${ext}`;
      const destPath = path.join(UPLOAD_DIR, fileName);
      if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      fs.copyFileSync(resourceFile.filepath, destPath);
      fs.unlinkSync(resourceFile.filepath);
      file_path = `uploads/resources/${fileName}`;
    }

    const v = await ResourceVersionService.create({
      resource_id: parseInt(ctx.params.id),
      version,
      file_path,
    });

    Response.created(ctx, v);
  }

  static async listAll(ctx) {
    const { limit, cursor, category_id, search, status, sort } = ctx.query;
    const result = await ResourceService.getList({
      limit: parseInt(limit) || 20,
      cursor: cursor || null,
      category_id: category_id || null,
      search: search || null,
      status: status || null,
      sort: sort || null,
    });
    Response.success(ctx, { data: result.data, next_cursor: result.next_cursor, has_more: result.has_more });
  }

  static async adminDelete(ctx) {
    const result = await ResourceService.adminDelete(parseInt(ctx.params.id));
    if (!result) {
      return Response.error(ctx, '资源不存在', 404);
    }
    Response.success(ctx, { message: '资源已删除' });
  }

  static async updateStatus(ctx) {
    const { status } = ctx.request.body;
    if (!['approved', 'pending', 'rejected'].includes(status)) {
      ctx.status = 400;
      return Response.error(ctx, '无效状态');
    }
    const resource = await ResourceService.updateStatus(parseInt(ctx.params.id), status);
    if (!resource) {
      ctx.status = 404;
      return Response.error(ctx, '资源不存在');
    }
    Response.success(ctx, resource);
  }
}

module.exports = ResourceController;