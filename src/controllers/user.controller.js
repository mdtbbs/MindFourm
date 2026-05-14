const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config');
const Response = require('../utils/response');
const UserService = require('../services/user.service');

class UserController {
  static getById(ctx) {
    const user = UserService.getById(parseInt(ctx.params.id));
    if (!user) {
      Response.notFound(ctx, 'User not found');
      return;
    }
    Response.success(ctx, user);
  }

  static getMyProfile(ctx) {
    const user = UserService.getById(ctx.state.user.id);
    if (!user) {
      Response.notFound(ctx, 'User not found');
      return;
    }
    Response.success(ctx, user);
  }

  static updateProfile(ctx) {
    const { username, bio } = ctx.request.body;
    const updates = {};
    if (username !== undefined) updates.username = username.trim().slice(0, 30);
    if (bio !== undefined) updates.bio = bio.trim().slice(0, 500);

    if (Object.keys(updates).length === 0) {
      Response.error(ctx, 'No valid fields to update', 400);
      return;
    }

    const user = UserService.updateProfile(ctx.state.user.id, updates);
    Response.success(ctx, user);
  }

  static uploadAvatar(ctx) {
    const file = ctx.request.files?.avatar;
    if (!file) {
      Response.error(ctx, 'No avatar file provided', 400);
      return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      Response.error(ctx, 'Only JPEG, PNG, GIF, and WebP images are allowed', 400);
      return;
    }

    // Validate file size (max 2MB)
    const maxSize = 2 * 1024 * 1024;
    if (Array.isArray(file)) {
      if (file[0].size > maxSize) {
        Response.error(ctx, 'Avatar must be smaller than 2MB', 400);
        return;
      }
    } else {
      if (file.size > maxSize) {
        Response.error(ctx, 'Avatar must be smaller than 2MB', 400);
        return;
      }
    }

    const avatarFile = Array.isArray(file) ? file[0] : file;

    // Create uploads directory
    const uploadsDir = path.join(__dirname, '../../uploads/avatars');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Generate unique filename
    const ext = path.extname(avatarFile.name) || '.jpg';
    const filename = `avatar_${ctx.state.user.id}_${crypto.randomBytes(8).toString('hex')}${ext}`;
    const filepath = path.join(uploadsDir, filename);

    // Move file
    avatarFile.mv(filepath);

    // Update user
    const avatarUrl = `/uploads/avatars/${filename}`;
    const user = UserService.updateAvatar(ctx.state.user.id, avatarUrl);

    Response.success(ctx, { avatar_url: user.avatar_url });
  }

  static removeAvatar(ctx) {
    const user = UserService.getById(ctx.state.user.id);
    if (user?.avatar_url) {
      // Delete file from disk
      const filepath = path.join(__dirname, '../..', user.avatar_url);
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    }

    UserService.removeAvatar(ctx.state.user.id);
    Response.success(ctx, { message: 'Avatar removed' });
  }

  static getMyReplies(ctx) {
    const { page, limit } = ctx.query;
    const result = UserService.getRepliesByUserId(ctx.state.user.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50
    });
    Response.paginated(ctx, result.data, result.pagination);
  }

  static getRepliesByUserId(ctx) {
    const { page, limit } = ctx.query;
    const result = UserService.getRepliesByUserId(parseInt(ctx.params.id), {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50
    });
    Response.paginated(ctx, result.data, result.pagination);
  }
}

module.exports = UserController;
