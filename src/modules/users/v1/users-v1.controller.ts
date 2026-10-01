import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, Put, Req, UnauthorizedException, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../../common/decorators/api-v1.decorator';
import { OAuthProtected } from '../../../common/decorators/oauth-protected.decorator';
import { UsersService } from '../users.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { avatarUploadInterceptor, cleanupUploadedFile } from '../users.controller';
import { assertSafeUploadedFile } from '@common/utils/upload-safety.util';
import { V1PermissionResolverService } from './v1-permission-resolver.service';
import { AllowBannedUser } from '../../../common/decorators/allow-banned-user.decorator';

export type V1MeDto = {
  id: number;
  username: string;
  avatar_url: string | null;
  avatar_status: string;
  bio: string | null;
  role: string;
  phone_verified: boolean;
  email_verified: boolean;
  preferred_locale: string | null;
  verification: { email: boolean; phone: boolean };
  permissions: Awaited<ReturnType<V1PermissionResolverService['resolve']>>;
  created_at: string;
};

const PERMISSION_SCHEMA: any = {
  type: 'object', required: ['allowed', 'reason'], properties: {
    allowed: { type: 'boolean', example: true, description: '当前是否允许执行该操作。' },
    reason: { type: 'string', nullable: true, example: null, description: '不可执行时的稳定原因码；允许时为 null。' },
  },
};

const ME_SCHEMA: any = {
  type: 'object',
  required: ['id', 'username', 'avatar_url', 'avatar_status', 'bio', 'role', 'phone_verified', 'email_verified', 'preferred_locale', 'verification', 'permissions', 'created_at'],
  properties: {
    id: { type: 'integer', example: 45, description: '当前论坛用户 ID。' },
    username: { type: 'string', example: 'builder', description: '用户名。' },
    avatar_url: { type: 'string', nullable: true, example: null, description: '头像 URL。' },
    avatar_status: { type: 'string', example: 'approved', description: '头像审核状态。' },
    bio: { type: 'string', nullable: true, example: 'Mindustry 玩家', description: '个人简介。' },
    role: { type: 'string', example: 'user', description: '论坛角色。' },
    phone_verified: { type: 'boolean', example: true, description: '手机号是否已验证。' },
    email_verified: { type: 'boolean', example: true, description: '邮箱是否已验证。' },
    preferred_locale: { type: 'string', nullable: true, example: 'zh-CN', description: '用户选择的界面语言。' },
    verification: { type: 'object', description: '邮箱和手机号验证状态。', properties: {
      email: { type: 'boolean', example: true, description: '邮箱验证状态。' },
      phone: { type: 'boolean', example: true, description: '手机号验证状态。' },
    } },
    permissions: { type: 'object', description: '用于界面呈现的操作能力快照；接口仍会重新鉴权。', properties: {
      thread_create: { ...PERMISSION_SCHEMA, description: '是否可以创建讨论。' },
      reply_create: { ...PERMISSION_SCHEMA, description: '是否可以回复讨论。' },
      resource_upload: { ...PERMISSION_SCHEMA, description: '是否可以投稿资源。' },
      message_read: { ...PERMISSION_SCHEMA, description: '是否可以读取私信。' },
    } },
    created_at: { type: 'string', format: 'date-time', example: '2024-01-01T00:00:00.000Z', description: '账号创建时间。' },
  },
};

const PUBLIC_USER_SCHEMA: any = {
  type: 'object',
  required: ['id', 'username', 'avatar_url', 'avatar_status', 'bio', 'role', 'post_count', 'reply_count', 'created_at'],
  properties: {
    id: { type: 'integer', example: 45, description: '论坛用户 ID。' },
    username: { type: 'string', example: 'builder', description: '用户名。' },
    avatar_url: { type: 'string', nullable: true, example: null, description: '头像 URL。' },
    avatar_status: { type: 'string', example: 'approved', description: '头像审核状态。' },
    bio: { type: 'string', nullable: true, example: 'Mindustry 玩家', description: '个人简介。' },
    role: { type: 'string', example: 'user', description: '论坛角色。' },
    post_count: { type: 'integer', example: 12, description: '讨论数。' },
    reply_count: { type: 'integer', example: 34, description: '回复数。' },
    created_at: { type: 'string', format: 'date-time', example: '2024-01-01T00:00:00.000Z', description: '账号创建时间。' },
  },
};

@ApiV1()
@ApiTags('v1-users')
@Controller('v1')
export class UsersV1Controller {
  constructor(private readonly usersService: UsersService, private readonly permissionResolver: V1PermissionResolverService) {}

  @Get('me')
  @AllowBannedUser()
  @OAuthProtected('profile')
  @ApiOkResponse({ description: '当前用户资料、验证状态和能力快照。', schema: ME_SCHEMA })
  async getMe(@Req() req: any): Promise<V1MeDto> {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    const user = await this.usersService.getById(userId);
    return this.toMe(user, req.authContext);
  }

  @Get('users/:id')
  @ApiOkResponse({ description: '公开用户资料，不包含邮箱、手机号等私密字段。', schema: PUBLIC_USER_SCHEMA })
  async getPublic(@Param('id', ParseIntPipe) id: number) {
    const user = await this.usersService.getById(id);
    return {
      id: user.id, username: user.username, avatar_url: user.avatar_url || null,
      avatar_status: user.avatar_status, bio: user.bio || null, role: user.role,
      post_count: user.post_count || 0, reply_count: user.reply_count || 0,
      created_at: user.created_at.toISOString(),
    };
  }

  @Put('me/profile')
  @OAuthProtected('profile')
  @ApiOkResponse({ description: '更新后的当前用户资料。', schema: ME_SCHEMA })
  async updateMe(@Req() req: any, @Body() dto: UpdateProfileDto): Promise<V1MeDto> {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.toMe(await this.usersService.updateProfile(req.user.id, dto), req.authContext);
  }

  @Post('me/avatar')
  @OAuthProtected('profile')
  @ApiOkResponse({ description: '头像审核处理后的当前用户资料。', schema: ME_SCHEMA })
  @UseInterceptors(avatarUploadInterceptor)
  async uploadAvatar(@Req() req: any, @UploadedFile() file?: Express.Multer.File): Promise<V1MeDto> {
    if (!req.user?.id) { await cleanupUploadedFile(file); throw new UnauthorizedException('Not authenticated'); }
    if (!file) throw new BadRequestException('没有收到头像图片');
    try {
      await assertSafeUploadedFile(file, 2 * 1024 * 1024);
    return this.toMe(await this.usersService.updateAvatar(req.user.id, `/uploads/avatars/${file.filename}`), req.authContext);
    } catch (error) {
      await cleanupUploadedFile(file);
      throw error;
    }
  }

  private async toMe(user: any, authContext?: any): Promise<V1MeDto> {
    return { id: user.id, username: user.username, avatar_url: user.avatar_url || null, avatar_status: user.avatar_status,
      bio: user.bio || null, role: user.role, phone_verified: !!user.phone_verified,
      email_verified: !!user.email_verified, preferred_locale: user.preferred_locale || null,
      verification: { email: !!user.email_verified, phone: !!user.phone_verified },
      permissions: await this.permissionResolver.resolve(user, authContext),
      created_at: user.created_at.toISOString() };
  }
}
