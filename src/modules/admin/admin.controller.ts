import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { StatsService } from '../stats/stats.service';
import { SettingsService } from '../settings/settings.service';
import { LogsService } from '../logs/logs.service';
import { BansService } from '../bans/bans.service';
import { CategoriesService } from '../categories/categories.service';
import { TagsService } from '../tags/tags.service';
import { UsersService } from '../users/users.service';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';
import { UploadsService } from '../uploads/uploads.service';
import { cleanupUploadedPublicImage, publicImageUploadInterceptor } from '../uploads/public-image-upload';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BulkPostsDto } from './dto/bulk-posts.dto';
import { MergeTagsDto } from './dto/merge-tags.dto';
import { CreateBanDto } from '../bans/dto/create-ban.dto';

/** Safely parse a query param to int, falling back to a default when the
 *  global ValidationPipe turns a missing param into `undefined`/NaN. */
function toInt(value: unknown, fallback: number): number {
  const n = parseInt(value as any, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Like toInt but returns undefined instead of a fallback. */
function toIntOpt(value: unknown): number | undefined {
  const n = parseInt(value as any, 10);
  return Number.isFinite(n) ? n : undefined;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly statsService: StatsService,
    private readonly settingsService: SettingsService,
    private readonly logsService: LogsService,
    private readonly bansService: BansService,
    private readonly categoriesService: CategoriesService,
    private readonly tagsService: TagsService,
    private readonly usersService: UsersService,
    private readonly adminNotificationsService: AdminNotificationsService,
    private readonly uploadsService: UploadsService,
  ) {}

  /**
   * GET /admin/stats - Dashboard statistics (moderator+)
   */
  @Get('stats')
  @Roles('moderator', 'admin')
  async getStats() {
    return this.adminService.getStats();
  }

  /**
   * GET /admin/badge-counts - Moderation badge counts (moderator+)
   */
  @Get('badge-counts')
  @Roles('moderator', 'admin')
  async getBadgeCounts() {
    return this.adminService.getBadgeCounts();
  }

  /**
   * GET /admin/settings - All settings (admin only)
   */
  @Get('settings')
  @Roles('admin')
  async getAllSettings() {
    return this.settingsService.getAllForAdmin();
  }

  /**
   * GET /admin/settings/:category - Category settings (admin only)
   */
  @Get('settings/:category')
  @Roles('admin')
  async getCategorySettings(@Param('category') category: string) {
    return this.settingsService.getByCategoryForAdmin(category);
  }

  /**
   * PUT /admin/settings/:category - Batch update settings (admin only)
   */
  @Put('settings/:category')
  @Roles('admin')
  async updateSettings(
    @Param('category') category: string,
    @Body() settings: Record<string, string>,
  ) {
    await this.settingsService.setBatch(category, settings);
    return { message: 'Settings updated' };
  }

  /**
   * POST /admin/settings/basic/site-logo - Upload and apply site logo (admin only)
   */
  @Post('settings/basic/site-logo')
  @Roles('admin')
  @UseInterceptors(publicImageUploadInterceptor)
  async uploadSiteLogo(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!file) {
      throw new BadRequestException('没有收到图片');
    }

    const uploaded = this.uploadsService.toPublicImageResult(file);
    try {
      await this.settingsService.setBatch('basic', { site_logo_url: uploaded.url });
      await this.logOperation(req, 'settings.site_logo.upload', 'setting', undefined, {
        key: 'site_logo_url',
        url: uploaded.url,
        size: uploaded.size,
        mime_type: uploaded.mime_type,
      });
      return uploaded;
    } catch (error) {
      await cleanupUploadedPublicImage(file);
      throw error;
    }
  }

  /**
   * GET /admin/users - User list (admin only)
   */
  @Get('users')
  @Roles('admin')
  async getUsers(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('search') search?: string,
  ) {
    const safePage = toInt(page, 1);
    const safeLimit = toInt(limit, 20);
    const { users, total } = await this.usersService.getAll(safePage, safeLimit, search);
    return {
      data: users,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  /**
   * PUT /admin/users/:id/role - Change user role (admin only)
   */
  @Put('users/:id/role')
  @Roles('admin')
  async updateUserRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { role: string },
    @Req() req: any,
  ) {
    const user = await this.usersService.updateRole(id, body.role);
    await this.logOperation(req, 'user.role.update', 'user', id, { new_role: body.role });
    return user;
  }

  /**
   * GET /admin/posts - Post management list (moderator+)
   */
  @Get('posts')
  @Roles('moderator', 'admin')
  async getPosts(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('status') status?: string,
    @Query('category_id') category_id?: number,
  ) {
    return this.adminService.getPosts({
      page: toInt(page, 1),
      limit: toInt(limit, 20),
      status,
      category_id: toIntOpt(category_id),
    });
  }

  /**
   * DELETE /admin/posts - Bulk delete posts (moderator+)
   */
  @Delete('posts')
  @Roles('moderator', 'admin')
  async bulkDeletePosts(@Body() dto: BulkPostsDto) {
    await this.adminService.bulkDeletePosts(dto.post_ids);
    return { message: `${dto.post_ids.length} posts deleted` };
  }

  /**
   * PUT /admin/posts/pin - Bulk pin posts (moderator+)
   */
  @Put('posts/pin')
  @Roles('moderator', 'admin')
  async bulkPinPosts(@Body() dto: BulkPostsDto) {
    await this.adminService.bulkPinPosts(dto.post_ids, dto.is_pinned ?? 1);
    return { message: `${dto.post_ids.length} posts pinned` };
  }

  /**
   * PUT /admin/posts/move - Bulk move posts (moderator+)
   */
  @Put('posts/move')
  @Roles('moderator', 'admin')
  async bulkMovePosts(@Body() dto: BulkPostsDto) {
    if (!dto.category_id) {
      throw new Error('category_id is required');
    }
    await this.adminService.bulkMovePosts(dto.post_ids, dto.category_id);
    return { message: `${dto.post_ids.length} posts moved` };
  }

  /**
   * PUT /admin/posts/:id/pin - Pin single post (moderator+)
   */
  @Put('posts/:id/pin')
  @Roles('moderator', 'admin')
  async pinPost(@Param('id', ParseIntPipe) id: number, @Body() body: { is_pinned: number }) {
    return this.adminService.pinPost(id, body.is_pinned);
  }

  /**
   * PUT /admin/posts/:id/move - Move single post (moderator+)
   */
  @Put('posts/:id/move')
  @Roles('moderator', 'admin')
  async movePost(@Param('id', ParseIntPipe) id: number, @Body() body: { category_id: number }) {
    return this.adminService.movePost(id, body.category_id);
  }

  /**
   * POST /admin/categories - Create category (admin only)
   */
  @Post('categories')
  @Roles('admin')
  async createCategory(@Body() dto: any) {
    return this.categoriesService.create(dto);
  }

  /**
   * PUT /admin/categories/:id - Update category (admin only)
   */
  @Put('categories/:id')
  @Roles('admin')
  async updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
  ) {
    return this.categoriesService.update(id, dto);
  }

  /**
   * DELETE /admin/categories/:id - Delete category (admin only)
   */
  @Delete('categories/:id')
  @Roles('admin')
  async deleteCategory(@Param('id', ParseIntPipe) id: number) {
    await this.categoriesService.delete(id);
    return { message: 'Category deleted' };
  }

  /**
   * GET /admin/tags - Tag list (admin only)
   */
  @Get('tags')
  @Roles('admin')
  async getTags(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.tagsService.findAll(toInt(page, 1), toInt(limit, 20));
  }

  /**
   * POST /admin/tags - Create tag (admin only)
   */
  @Post('tags')
  @Roles('admin')
  async createTag(@Body() dto: any) {
    return this.tagsService.create(dto);
  }

  /**
   * PUT /admin/tags/:id - Update tag (admin only)
   */
  @Put('tags/:id')
  @Roles('admin')
  async updateTag(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
  ) {
    return this.tagsService.update(id, dto);
  }

  /**
   * DELETE /admin/tags/:id - Delete tag (admin only)
   */
  @Delete('tags/:id')
  @Roles('admin')
  async deleteTag(@Param('id', ParseIntPipe) id: number) {
    await this.tagsService.delete(id);
    return { message: 'Tag deleted' };
  }

  /**
   * POST /admin/tags/merge - Merge two tags (admin only)
   */
  @Post('tags/merge')
  @Roles('admin')
  async mergeTags(@Body() dto: MergeTagsDto) {
    await this.adminService.mergeTags(dto.from_tag_id, dto.to_tag_id);
    return { message: 'Tags merged' };
  }

  /**
   * GET /admin/moderation - Moderation queue (moderator+)
   */
  @Get('moderation')
  @Roles('moderator', 'admin')
  async getModerationQueue(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('type') type: string = 'all',
  ) {
    return this.adminService.getModerationQueue(
      type,
      toInt(page, 1),
      toInt(limit, 20),
    );
  }

  /**
   * PUT /admin/moderation/:id/approve - Approve item (moderator+)
   */
  @Put('moderation/:id/approve')
  @Roles('moderator', 'admin')
  async approveItem(
    @Param('id', ParseIntPipe) id: number,
    @Body('type') type: string = 'post',
    @Req() req: any,
  ) {
    await this.adminService.approveModerationItem(type, id);
    await this.publishModerationResult(type, id, 'approved', req.user?.username);
    await this.logOperation(req, 'moderation.approve', type, id);
    return { message: 'Item approved' };
  }

  /**
   * PUT /admin/moderation/:id/reject - Reject item (moderator+)
   */
  @Put('moderation/:id/reject')
  @Roles('moderator', 'admin')
  async rejectItem(
    @Param('id', ParseIntPipe) id: number,
    @Body('type') type: string = 'post',
    @Body('reason') reason: string | null,
    @Req() req: any,
  ) {
    await this.adminService.rejectModerationItem(type, id, reason);
    await this.publishModerationResult(type, id, 'rejected', req.user?.username);
    await this.logOperation(req, 'moderation.reject', type, id);
    return { message: 'Item rejected' };
  }

  /**
   * GET /admin/bans - Ban list (admin only)
   */
  @Get('bans')
  @Roles('admin')
  async getBans(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('ban_type') ban_type?: string,
    @Query('is_active') is_active?: number,
  ) {
    return this.bansService.getList({
      page: toInt(page, 1),
      limit: toInt(limit, 20),
      ban_type,
      is_active: toIntOpt(is_active),
    });
  }

  /**
   * POST /admin/bans - Create ban (admin only)
   */
  @Post('bans')
  @Roles('admin')
  async createBan(@Body() dto: CreateBanDto, @Req() req: any) {
    return this.bansService.create({
      ban_type: dto.ban_type,
      value: dto.value,
      reason: dto.reason,
      // Taken from the session: reading `?user_id=` made the audit trail
      // attacker-supplied, or undefined (violating the FK) when omitted.
      created_by: req.user.id,
    });
  }

  /**
   * PUT /admin/bans/:id - Update ban (admin only)
   */
  @Put('bans/:id')
  @Roles('admin')
  async updateBan(
    @Param('id', ParseIntPipe) id: number,
    @Body() updates: { reason?: string; is_active?: number },
  ) {
    return this.bansService.update(id, updates);
  }

  /**
   * DELETE /admin/bans/:id - Deactivate ban (admin only)
   */
  @Delete('bans/:id')
  @Roles('admin')
  async deactivateBan(@Param('id', ParseIntPipe) id: number) {
    await this.bansService.deactivate(id);
    return { message: 'Ban deactivated' };
  }

  /**
   * POST /admin/cleanup/sessions - Cleanup expired sessions (admin only)
   */
  @Post('cleanup/sessions')
  @Roles('admin')
  async cleanupSessions() {
    const removed = await this.adminService.cleanupSessions();
    return { message: `已清理 ${removed} 条过期会话审计记录`, removed };
  }

  /**
   * POST /admin/cleanup/logs - Cleanup old logs (admin only)
   */
  @Post('cleanup/logs')
  @Roles('admin')
  async cleanupLogs(@Req() req: any) {
    const count = await this.adminService.cleanupLogs();
    await this.logOperation(req, 'cleanup.logs', 'operation_log', undefined, { count });
    return { message: `${count} logs cleaned up` };
  }

  /**
   * POST /admin/cleanup/soft-deleted - Cleanup soft deleted items (admin only)
   */
  @Post('cleanup/soft-deleted')
  @Roles('admin')
  async cleanupSoftDeleted() {
    const count = await this.adminService.cleanupSoftDeleted();
    return { message: `${count} items cleaned up` };
  }

  /**
   * GET /admin/logs - Operation logs (admin only)
   */
  @Get('logs')
  @Roles('admin')
  async getLogs(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('user_id') user_id?: number,
    @Query('action') action?: string,
    @Query('target_type') target_type?: string,
  ) {
    return this.logsService.getLogs({
      page: toInt(page, 1),
      limit: toInt(limit, 20),
      user_id: toIntOpt(user_id),
      action,
      target_type,
    });
  }

  private async logOperation(
    req: any,
    action: string,
    targetType?: string,
    targetId?: number,
    details?: Record<string, unknown>,
  ) {
    await this.logsService.log({
      user_id: req.user?.id,
      action,
      target_type: targetType,
      target_id: targetId,
      details: details ? JSON.stringify(details) : undefined,
      ip_address: this.getClientIp(req),
      user_agent: req.headers?.['user-agent'],
    }).catch((err) => console.warn('operation log failed:', err.message));
  }

  private getClientIp(req: any): string {
    return (req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  }

  private async publishModerationResult(
    type: string,
    id: number,
    action: 'approved' | 'rejected',
    actorUsername?: string,
  ) {
    const normalizedType = type === 'replies'
      ? 'reply'
      : type === 'avatars'
        ? 'avatar'
        : type === 'posts'
          ? 'post'
          : type;

    if (!['post', 'reply', 'avatar'].includes(normalizedType)) {
      return;
    }

    await this.adminNotificationsService.publishModerationResult({
      item_type: normalizedType as 'post' | 'reply' | 'avatar',
      item_id: id,
      action,
      actor_username: actorUsername,
      action_url: '/admin/content/moderation',
    }).catch((err) => console.warn('admin notification publish failed:', err.message));
  }
}
