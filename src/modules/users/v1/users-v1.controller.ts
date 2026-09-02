import { Controller, Get, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../../common/decorators/api-v1.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { UsersService } from '../users.service';

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
    return {
      id: user.id,
      username: user.username,
      avatar_url: user.avatar_url || null,
      avatar_status: user.avatar_status,
      bio: user.bio || null,
      role: user.role,
      phone_verified: !!user.phone_verified,
      created_at: user.created_at.toISOString(),
    };
  }
}
