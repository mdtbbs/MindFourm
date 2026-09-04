import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, Put, Req, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../../common/decorators/api-v1.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { UsersService } from '../users.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { avatarUploadInterceptor, cleanupUploadedFile } from '../users.controller';
import { assertSafeUploadedFile } from '@common/utils/upload-safety.util';

export type V1MeDto = {
  id: number;
  username: string;
  avatar_url: string | null;
  avatar_status: string;
  bio: string | null;
  role: string;
  phone_verified: boolean;
  created_at: string;
};

@ApiV1()
@ApiTags('v1-users')
@Controller('v1')
export class UsersV1Controller {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: 'Authenticated viewer profile with stable first-party fields.' })
  async getMe(@Req() req: any): Promise<V1MeDto> {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    const user = await this.usersService.getById(userId);
    return this.toMe(user);
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
  @UseGuards(JwtAuthGuard)
  async updateMe(@Req() req: any, @Body() dto: UpdateProfileDto): Promise<V1MeDto> {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.toMe(await this.usersService.updateProfile(req.user.id, dto));
  }

  @Post('me/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(avatarUploadInterceptor)
  async uploadAvatar(@Req() req: any, @UploadedFile() file?: Express.Multer.File): Promise<V1MeDto> {
    if (!req.user?.id) { await cleanupUploadedFile(file); throw new UnauthorizedException('Not authenticated'); }
    if (!file) throw new BadRequestException('没有收到头像图片');
    try {
      await assertSafeUploadedFile(file, 2 * 1024 * 1024);
      return this.toMe(await this.usersService.updateAvatar(req.user.id, `/uploads/avatars/${file.filename}`));
    } catch (error) {
      await cleanupUploadedFile(file);
      throw error;
    }
  }

  private toMe(user: any): V1MeDto {
    return { id: user.id, username: user.username, avatar_url: user.avatar_url || null, avatar_status: user.avatar_status,
      bio: user.bio || null, role: user.role, phone_verified: !!user.phone_verified, created_at: user.created_at.toISOString() };
  }
}
