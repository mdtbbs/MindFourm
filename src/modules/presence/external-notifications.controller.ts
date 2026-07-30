import {
  Controller,
  Post,
  Body,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExternalApiKeyGuard } from '@common/guards/external-api-key.guard';
import { ExternalScope } from '@common/decorators/external-scope.decorator';
import { SkipPhoneVerification } from '@common/decorators/skip-phone-verification.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../../entities/user.entity';

const ALLOWED_NOTIFICATION_TYPES = ['friend_invite'] as const;
type AllowedNotificationType = typeof ALLOWED_NOTIFICATION_TYPES[number];

interface FriendInviteRoomPayload {
  code: string;
  name: string;
  display_name: string;
  node_name: string;
}

interface FriendInviteFromUser {
  id: number;
  username: string;
  avatar_url?: string;
}

interface FriendInvitePayload {
  from_user: FriendInviteFromUser;
  room: FriendInviteRoomPayload;
  expires_in: number;
}

interface SendNotificationBody {
  user_id: number;
  type: string;
  payload: FriendInvitePayload;
}

@Controller('external/v1/notifications')
@SkipPhoneVerification()
@UseGuards(ExternalApiKeyGuard)
export class ExternalNotificationsController {
  private readonly logger = new Logger(ExternalNotificationsController.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * POST /api/external/v1/notifications
   * Send a notification to a user. Currently supports `friend_invite`.
   *
   * Persists the notification to the DB (so it shows up in the notification list
   * even if the user is offline) and pushes it to SSE for online users.
   */
  @Post()
  @ExternalScope('notifications:write')
  async sendNotification(@Body() body: SendNotificationBody) {
    if (!body || typeof body.user_id !== 'number' || !body.type) {
      return { ok: false, error: 'Missing user_id or type' };
    }

    if (!ALLOWED_NOTIFICATION_TYPES.includes(body.type as AllowedNotificationType)) {
      return {
        ok: false,
        error: `Unsupported notification type. Allowed: ${ALLOWED_NOTIFICATION_TYPES.join(', ')}`,
      };
    }

    const targetUser = await this.userRepo.findOne({
      where: { id: body.user_id },
      select: ['id'],
    });
    if (!targetUser) {
      return { ok: false, error: 'user_id not found' };
    }

    if (body.type === 'friend_invite') {
      return this.handleFriendInvite(body.user_id, body.payload);
    }

    return { ok: false, error: 'Unhandled notification type' };
  }

  private async handleFriendInvite(
    userId: number,
    payload: FriendInvitePayload,
  ): Promise<{ ok: boolean; error?: string; notification_id?: number }> {
    if (!payload || !payload.from_user || !payload.room) {
      return { ok: false, error: 'Invalid payload: missing from_user or room' };
    }

    // Store the full payload as JSON in the notification content so the client
    // can render the invite card with all the room details.
    const content = JSON.stringify(payload);

    try {
      const notification = await this.notificationsService.create({
        user_id: userId,
        type: 'friend_invite',
        actor_id: payload.from_user.id,
        content,
        emailEvent: false,
      });
      return { ok: true, notification_id: notification.id };
    } catch (err) {
      this.logger.error(`Failed to create friend_invite notification: ${(err as Error).message}`);
      return { ok: false, error: 'Failed to create notification' };
    }
  }
}
