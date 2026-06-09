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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getCurrentUser(@Req() req: any) {
    const userId = req.user?.id;

    if (!userId) {
      throw new Error('Not authenticated');
    }

    return this.usersService.getById(userId);
  }

  @Put('me/profile')
  async updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    const userId = req.user?.id;

    if (!userId) {
      throw new Error('Not authenticated');
    }

    return this.usersService.updateProfile(userId, dto);
  }

  @Post('me/avatar')
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

    return this.usersService.updateAvatar(userId, avatarUrl);
  }

  @Delete('me/avatar')
  async removeAvatar(@Req() req: any) {
    const userId = req.user?.id;

    if (!userId) {
      throw new Error('Not authenticated');
    }

    return this.usersService.removeAvatar(userId);
  }

  @Get('me/replies')
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
}
