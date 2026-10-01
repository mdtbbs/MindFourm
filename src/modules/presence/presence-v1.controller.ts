import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../common/decorators/api-v1.decorator';
import { OAuthProtected } from '../../common/decorators/oauth-protected.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { FriendsService } from '../friends/friends.service';
import { MultiplayerService } from '../multiplayer/multiplayer.service';
import { PresencePolicyService } from './presence-policy.service';
import { SocialPrivacyService } from '../social/social-privacy.service';
import { PresenceConnectionsService } from './presence-connections.service';
import {
  CreatePresenceConnectionDto, FriendPresenceQueryDto, PatchPresenceConnectionDto, PutRichActivityDto,
} from './dto/presence-v1.dto';

@ApiV1()
@ApiTags('在线状态')
@Controller('v1/presence/connections')
export class PresenceV1Controller {
  constructor(private readonly connections: PresenceConnectionsService) {}

  @OAuthProtected('presence.write')
  @Post()
  @RateLimit({ max: 20, window: 60 })
  create(@Body() body: CreatePresenceConnectionDto, @Req() request: any) {
    return this.connections.create(request.user.id, request.authContext?.clientId || 'forum_web', body.platform, body.status,
      request.authContext?.source === 'mindauth_oauth' && request.authContext?.partyType === 'third_party');
  }

  @OAuthProtected('presence.write')
  @Patch(':id')
  patch(@Param('id') id: string, @Body() body: PatchPresenceConnectionDto, @Req() request: any) {
    return this.connections.patch(request.user.id, id, body.status);
  }

  @OAuthProtected('presence.write')
  @Post(':id/heartbeat')
  @RateLimit({ max: 60, window: 60 })
  heartbeat(@Param('id') id: string, @Req() request: any) { return this.connections.heartbeat(request.user.id, id); }

  @OAuthProtected('presence.write')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() request: any) { return this.connections.remove(request.user.id, id); }

  @OAuthProtected('presence.write')
  @Put(':id/activity')
  @RateLimit({ max: 30, window: 60 })
  activity(@Param('id') id: string, @Body() body: PutRichActivityDto, @Req() request: any) {
    return this.connections.putActivity(request.user.id, id, body,
      request.authContext?.source === 'mindauth_oauth' && request.authContext?.partyType === 'third_party');
  }

  @OAuthProtected('presence.write')
  @Delete(':id/activity')
  removeActivity(@Param('id') id: string, @Req() request: any) { return this.connections.deleteActivity(request.user.id, id); }
}

@ApiV1()
@ApiTags('好友', '在线状态', '活动')
@Controller('v1/social/friends/presence')
export class SocialFriendsPresenceV1Controller {
  constructor(
    private readonly friends: FriendsService,
    private readonly connections: PresenceConnectionsService,
    private readonly policy: PresencePolicyService,
    private readonly privacy: SocialPrivacyService,
    private readonly multiplayer: MultiplayerService,
  ) {}

  @OAuthProtected('friends.read', 'presence.read')
  @Get()
  @RateLimit({ max: 60, window: 60 })
  @ApiQuery({ name: 'page', required: false, type: Number, schema: { minimum: 1 }, example: 1, description: '好友列表页码，从 1 开始。' })
  @ApiQuery({ name: 'limit', required: false, type: Number, schema: { minimum: 1, maximum: 50 }, example: 50, description: '每页好友数，最大 50。' })
  async list(@Query() query: FriendPresenceQueryDto, @Req() request: any) {
    const userId = request.user.id;
    const page = query.page || 1;
    const limit = query.limit || 50;
    const result = await this.friends.getFriendsList(userId, page, limit);
    const friends = result.friends.filter((friend): friend is typeof friend & { id: number } => Number.isInteger(friend.id));
    const ids = friends.map((friend) => friend.id);
    const [presences, visiblePresence, visibleActivity, settings] = await Promise.all([
      this.connections.getSocialSnapshots(ids),
      this.policy.canSeeMany(userId, ids, 'presence_visibility'),
      this.policy.canSeeMany(userId, ids, 'activity_visibility'),
      this.policy.settingsForMany(ids),
    ]);
    const clientIds = friends.flatMap((friend) => {
      const clientId = presences.get(friend.id)?.activity?.client_id;
      return clientId ? [clientId] : [];
    });
    const clientMetadata = await this.multiplayer.clientMetadataFor(clientIds);
    const actionsByUser = await this.multiplayer.actionsForActivities(userId, friends.map((friend) => ({
      user_id: friend.id,
      session_id: presences.get(friend.id)?.activity?.join?.session_id || null,
    })));
    const data = friends.map((friend) => {
      const visible = visiblePresence.get(friend.id) === true;
      const snapshot = presences.get(friend.id);
      const status = visible ? snapshot?.status || 'offline' : 'offline';
      const rawActivity = visible && visibleActivity.get(friend.id) ? snapshot?.activity || null : null;
      const action = actionsByUser.get(friend.id);
      const visibleActivityValue = rawActivity?.join?.session_id && !action?.session_visible
        ? { ...rawActivity, join: undefined }
        : rawActivity;
      const activity = visibleActivityValue ? {
        ...visibleActivityValue,
        client: clientMetadata.get(visibleActivityValue.client_id) || { client_id: visibleActivityValue.client_id },
      } : null;
      const setting = settings.get(friend.id);
      return {
        user: friend,
        presence: {
          status,
          ...(visible && setting?.show_last_seen && status === 'offline' && snapshot?.last_seen_at
            ? { last_seen_at: Math.floor(snapshot.last_seen_at / 1000) }
            : {}),
        },
        activity,
        actions: action || { can_join: false, can_request_join: false, can_invite: false, session_visible: false },
      };
    });
    return {
      data,
      pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
    };
  }
}
