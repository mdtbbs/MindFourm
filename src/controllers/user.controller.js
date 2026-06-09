const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Response = require('../utils/response');
const UserService = require('../services/user.service');

class UserController {
  static async getById(ctx) {
    const user = await UserService.getById(parseInt(ctx.params.id));
    if (!user) {
      Response.notFound(ctx, 'User not found');
      return;
    }
    Response.success(ctx, UserService.toPublicProfile(user));
  }

  static async getMyProfile(ctx) {
    const user = await UserService.getById(ctx.state.user.id);
    if (!user) {
      Response.notFound(ctx, 'User not found');
      return;
    }
    Response.success(ctx, user);
  }

  static async updateProfile(ctx) {
    const { username, bio } = ctx.request.body;
    const updates = {};
    if (username !== undefined) updates.username = username.trim().slice(0, 30);
    if (bio !== undefined) updates.bio = bio.trim().slice(0, 500);

    if (Object.keys(updates).length === 0) {
      Response.error(ctx, 'No valid fields to update', 400);
      return;
    }

    const user = await UserService.updateProfile(ctx.state.user.id, updates);
    Response.success(ctx, user);
  }

  static async uploadAvatar(ctx) {
    const file = ctx.request.files?.avatar;
    if (!file) {
      Response.error(ctx, 'No avatar file provided', 400);
      return;
    }

    const avatarFile = Array.isArray(file) ? file[0] : file;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(avatarFile.mimetype)) {
      Response.error(ctx, 'Only JPEG, PNG, GIF, and WebP images are allowed', 400);
      return;
    }

    const uploadsDir = path.join(__dirname, '../../uploads/avatars');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const ext = path.extname(avatarFile.originalFilename) || '.jpg';
    const filename = `avatar_${ctx.state.user.id}_${crypto.randomBytes(8).toString('hex')}${ext}`;
    const filepath = path.join(uploadsDir, filename);

    fs.renameSync(avatarFile.filepath, filepath);

    const avatarUrl = `/uploads/avatars/${filename}`;
    const user = await UserService.updateAvatar(ctx.state.user.id, avatarUrl);

    Response.success(ctx, { avatar_url: user.avatar_url });
  }

  static async removeAvatar(ctx) {
    const user = await UserService.getById(ctx.state.user.id);
    if (user?.avatar_url) {
      const filepath = path.join(__dirname, '../..', user.avatar_url);
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    }

    await UserService.removeAvatar(ctx.state.user.id);
    Response.success(ctx, { message: 'Avatar removed' });
  }

  static async getMyReplies(ctx) {
    const { page, limit } = ctx.query;
    const result = await UserService.getRepliesByUserId(ctx.state.user.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50
    });
    Response.paginated(ctx, result.data, result.pagination);
  }

  static async getRepliesByUserId(ctx) {
    const { page, limit } = ctx.query;
    const result = await UserService.getRepliesByUserId(parseInt(ctx.params.id), {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50
    });
    Response.paginated(ctx, result.data, result.pagination);
  }

  static async searchUsers(ctx) {
    const { q, limit } = ctx.query;
    if (!q || !q.trim()) {
      Response.success(ctx, []);
      return;
    }
    const users = await UserService.searchByUsername(q.trim(), parseInt(limit) || 10);
    Response.success(ctx, users);
  }
}

module.exports = UserController;