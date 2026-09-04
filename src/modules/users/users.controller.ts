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
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { mkdirSync } from 'fs';
import * as fs from 'fs/promises';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { toPublicUser, toPublicUsers } from './public-user.util';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LogsService } from '../logs/logs.service';
import { getClientIp } from '@common/utils/client-context.util';

const AVATAR_UPLOAD_DIR = './uploads/avatars';
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const ALLOWED_AVATAR_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

function avatarFileFilter(
  _req: any,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  const ext = extname(file.originalname).toLowerCase();
  if (!ALLOWED_AVATAR_MIME_TYPES.has(file.mimetype) || !ALLOWED_AVATAR_EXTENSIONS.has(ext)) {
    callback(new BadRequestException('Avatar file type is not allowed'), false);
    return;
  }

  callback(null, true);
}

export const avatarUploadInterceptor = FileInterceptor('avatar', {
  storage: diskStorage({
    destination: (_req, _file, callback) => {
      mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true });
      callback(null, AVATAR_UPLOAD_DIR);
    },
    filename: (_req, file, callback) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      callback(null, `${uniqueSuffix}${extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: MAX_AVATAR_SIZE },
  fileFilter: avatarFileFilter,
});

export async function cleanupUploadedFile(file?: Express.Multer.File): Promise<void> {
  if (!file?.path) return;
  await fs.unlink(file.path).catch(() => undefined);
}

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
      throw new UnauthorizedException('Not authenticated');
    }

    return this.usersService.getById(userId);
  }

  @Put('me/profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
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
  @UseInterceptors(avatarUploadInterceptor)
  async uploadAvatar(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    const userId = req.user?.id;

    if (!userId) {
      await cleanupUploadedFile(file);
      throw new UnauthorizedException('Not authenticated');
    }

    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const avatarUrl = `/uploads/avatars/${file.filename}`;

    try {
      const user = await this.usersService.updateAvatar(userId, avatarUrl);
      await this.logOperation(req, 'user.avatar.upload', 'user', userId, {
        avatar_status: user.avatar_status,
        pending: user.avatar_status === 'pending',
      });
      return user;
    } catch (error) {
      await cleanupUploadedFile(file);
      throw error;
    }
  }

  @Delete('me/avatar')
  @UseGuards(JwtAuthGuard)
  async removeAvatar(@Req() req: any) {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
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
      throw new UnauthorizedException('Not authenticated');
    }

    return this.usersService.getRepliesByUserId(userId, page || 1, limit || 20);
  }

  @Get('search')
  async searchUsers(@Query('q') query?: string, @Query('limit') limit?: number) {
    if (!query) {
      return [];
    }

    return toPublicUsers(await this.usersService.searchByUsername(query, limit || 10));
  }

  @Get(':id')
  async getUserById(@Param('id') id: string) {
    // Unauthenticated route — must not return the raw entity (see toPublicUser).
    return toPublicUser(await this.usersService.getById(parseInt(id, 10)));
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
    return getClientIp(req);
  }
}
