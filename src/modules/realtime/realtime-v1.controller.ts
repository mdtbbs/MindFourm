import { Controller, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'crypto';
import { ApiV1 } from '../../common/decorators/api-v1.decorator';
import { OAuthProtected } from '../../common/decorators/oauth-protected.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { RedisService } from '../../database/redis.service';

@ApiV1()
@ApiTags('实时事件')
@Controller('v1/realtime/tickets')
export class RealtimeV1Controller {
  constructor(private readonly redis: RedisService) {}

  @OAuthProtected('friends.read')
  @Post()
  @RateLimit({ max: 30, window: 60 })
  async createTicket(@Req() request: any) {
    const ticket = randomBytes(24).toString('base64url');
    const clientId = String(request.authContext?.clientId || 'forum_web').slice(0, 128);
    await this.redis.set(
      `realtime:ticket:${ticket}`,
      `${request.user.id}:${JSON.stringify({ user_id: request.user.id, client_id: clientId })}`,
      60,
    );
    return { ticket, expires_in: 60, websocket_path: '/realtime/v1' };
  }
}
