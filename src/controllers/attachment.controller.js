const path = require('path');
const fs = require('fs');
const db = require('../database');
const AttachmentService = require('../services/attachment.service');
const PostService = require('../services/post.service');
const ReplyService = require('../services/reply.service');
const LogService = require('../services/log.service');
const Response = require('../utils/response');

const UPLOAD_DIR = path.join(__dirname, '../uploads/attachments');

class AttachmentController {
  static async upload(ctx) {
    const user = ctx.state.user;
    if (!user) {
      ctx.status = 401;
      return Response.error(ctx, '未登录');
    }

    // Verify ownership if post_id provided
    const post_id = ctx.request.body.post_id ? parseInt(ctx.request.body.post_id) : null;
    const reply_id = ctx.request.body.reply_id ? parseInt(ctx.request.body.reply_id) : null;

    if ((post_id && reply_id) || (!post_id && !reply_id)) {
      return Response.error(ctx, '附件必须且只能关联一个帖子或回复', 400);
    }

    if (post_id) {
      const post = await PostService.getById(post_id);
      if (!post) {
        return Response.error(ctx, '帖子不存在', 404);
      }
      // Only post owner or moderators can attach files
      const isOwner = post.user_id === user.id;
      const isModerator = user.role === 'admin' || user.role === 'moderator';
      if (!isOwner && !isModerator) {
        return Response.error(ctx, '无权向此帖子添加附件', 403);
      }
    }

    if (reply_id) {
      const reply = await ReplyService.getById(reply_id);
      if (!reply) {
        return Response.error(ctx, '回复不存在', 404);
      }
      // Only reply owner or moderators can attach files
      const isOwner = reply.user_id === user.id;
      const isModerator = user.role === 'admin' || user.role === 'moderator';
      if (!isOwner && !isModerator) {
        return Response.error(ctx, '无权向此回复添加附件', 403);
      }
    }

    const files = ctx.request.files?.files;
    if (!files) {
      ctx.status = 400;
      return Response.error(ctx, '请选择文件');
    }

    const fileArray = Array.isArray(files) ? files : [files];
    const results = [];

    for (const file of fileArray) {
      const safeName = path.basename(file.originalFilename || 'upload');
      const ext = path.extname(safeName);
      const baseName = path.basename(safeName, ext);
      const timestamp = Date.now();
      const fileName = `${baseName}_${timestamp}${ext}`;
      const destPath = path.join(UPLOAD_DIR, fileName);

      if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      }

      fs.copyFileSync(file.filepath, destPath);
      fs.unlinkSync(file.filepath);

      const attachment = await AttachmentService.create({
        post_id,
        reply_id,
        user_id: user.id,
        file_name: safeName,
        file_path: `uploads/attachments/${fileName}`,
        file_size: file.size,
        mime_type: file.mimetype,
      });

      results.push(attachment);
    }

    await LogService.log({
      user_id: user.id,
      action: 'ATTACHMENT_UPLOAD',
      target_type: 'attachment',
      details: { count: results.length },
      ip_address: ctx.ip,
      user_agent: ctx.headers['user-agent'],
    });

    Response.success(ctx, results.length === 1 ? results[0] : results);
  }

  static async download(ctx) {
    const attachment = await AttachmentService.getById(ctx.params.id);
    if (!attachment) {
      ctx.status = 404;
      return Response.error(ctx, '文件不存在');
    }

    await AttachmentService.incrementDownloadCount(attachment.id);

    const fullPath = path.join(__dirname, '..', attachment.file_path);
    if (!fs.existsSync(fullPath)) {
      ctx.status = 404;
      return Response.error(ctx, '文件已丢失');
    }

    ctx.set('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.file_name)}"`);
    ctx.set('Content-Type', attachment.mime_type);
    ctx.body = fs.createReadStream(fullPath);
  }

  static async deleteFile(ctx) {
    const user = ctx.state.user;
    if (!user || (user.role !== 'admin' && user.role !== 'moderator')) {
      ctx.status = 403;
      return Response.error(ctx, '无权限');
    }

    const attachment = await AttachmentService.getById(parseInt(ctx.params.id));
    if (!attachment) {
      ctx.status = 404;
      return Response.error(ctx, '附件不存在');
    }

    try {
      const fullPath = path.join(__dirname, '..', attachment.file_path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch (e) { /* ignore */ }

    await db.execute('DELETE FROM attachments WHERE id = ?', [parseInt(ctx.params.id)]);

    await LogService.log({
      user_id: user.id,
      action: 'ATTACHMENT_DELETE',
      target_type: 'attachment',
      target_id: parseInt(ctx.params.id),
      ip_address: ctx.ip,
      user_agent: ctx.headers['user-agent'],
    });

    Response.success(ctx, { message: '附件已删除' });
  }

  static async getByPost(ctx) {
    const attachments = await AttachmentService.getByPostId(parseInt(ctx.params.postId));
    Response.success(ctx, attachments);
  }
}

module.exports = AttachmentController;