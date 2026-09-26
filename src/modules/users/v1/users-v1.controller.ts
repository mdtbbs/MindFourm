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
  verification: { phone: boolean };
  permissions: Awaited<ReturnType<V1PermissionResolverService['resolve']>>;
  created_at: string;
};

@ApiV1()
@ApiTags('v1-users')
@Controller('v1')
export class UsersV1Controller {
  constructor(private readonly usersService: UsersService, private readonly permissionResolver: V1PermissionResolverService) {}

  @Get('me')
  @AllowBannedUser()
  @OAuthProtected('profile')
  @ApiOkResponse({ description: 'Authenticated viewer profile with stable first-party fields.' })
  async getMe(@Req() req: any): Promise<V1MeDto> {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    const user = await this.usersService.getById(userId);
    return this.toMe(user, req.authContext);
  }

  @Get('users/:id')
  @ApiOkResponse({ description: 'Public user profile without private account fields.' })
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
  async updateMe(@Req() req: any, @Body() dto: UpdateProfileDto): Promise<V1MeDto> {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.toMe(await this.usersService.updateProfile(req.user.id, dto), req.authContext);
  }

  @Post('me/avatar')
  @OAuthProtected('profile')
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
      verification: { phone: !!user.phone_verified },
      permissions: await this.permissionResolver.resolve(user, authContext),
      created_at: user.created_at.toISOString() };
  }
}
