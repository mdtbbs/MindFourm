import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseInterceptors,
  UploadedFile,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LogsService } from '../logs/logs.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly logsService: LogsService,
  ) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@Req() req: any) {
    const userId = req.user?.id;

    if (!userId) {
      throw new Error('Not authenticated');
    }

    return this.usersService.getById(userId);
  }

  @Put('me/profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    const userId = req.user?.id;

    if (!userId) {
      throw new Error('Not authenticated');
    }

    const user = await this.usersService.updateProfile(userId, dto);
    await this.logOperation(req, 'user.profile.update', 'user', userId, {
      username_changed: dto.username !== undefined,
      bio_changed: dto.bio !== undefined,
    });
    return user;
  }

  @Post('me/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('avatar'))
  async uploadAvatar(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    const userId = req.user?.id;

    if (!userId) {
      throw new Error('Not authenticated');
    }

    if (!file) {
      throw new Error('No file uploaded');
    }

    // In a real implementation, you'd upload to storage and get a URL
    // For now, we'll use a local path
    const avatarUrl = `/uploads/avatars/${file.filename}`;

    const user = await this.usersService.updateAvatar(userId, avatarUrl);
    await this.logOperation(req, 'user.avatar.upload', 'user', userId, {
      avatar_status: user.avatar_status,
      pending: user.avatar_status === 'pending',
    });
    return user;
  }

  @Delete('me/avatar')
  @UseGuards(JwtAuthGuard)
  async removeAvatar(@Req() req: any) {
    const userId = req.user?.id;

    if (!userId) {
      throw new Error('Not authenticated');
    }

    const user = await this.usersService.removeAvatar(userId);
    await this.logOperation(req, 'user.avatar.remove', 'user', userId);
    return user;
  }

  @Get('me/replies')
  @UseGuards(JwtAuthGuard)
  async getCurrentUserReplies(@Req() req: any, @Query('page') page?: number, @Query('limit') limit?: number) {
    const userId = req.user?.id;

    if (!userId) {
      throw new Error('Not authenticated');
    }

    return this.usersService.getRepliesByUserId(userId, page || 1, limit || 20);
  }

  @Get('search')
  async searchUsers(@Query('q') query?: string, @Query('limit') limit?: number) {
    if (!query) {
      return [];
    }

    return this.usersService.searchByUsername(query, limit || 10);
  }

  @Get(':id')
  async getUserById(@Param('id') id: string) {
    return this.usersService.getById(parseInt(id, 10));
  }

  @Get(':id/replies')
  async getUserReplies(@Param('id') id: string, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.usersService.getRepliesByUserId(parseInt(id, 10), page || 1, limit || 20);
  }

  private async logOperation(req: any, action: string, targetType?: string, targetId?: number, details?: Record<string, unknown>) {
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
}
