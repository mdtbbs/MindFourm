import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../common/decorators/api-v1.decorator';
import { OAuthProtected } from '../../common/decorators/oauth-protected.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { FriendsService } from '../friends/friends.service';
import { UserBlocksService } from '../user-blocks/user-blocks.service';
import { SocialPrivacyService } from './social-privacy.service';
import { CreateFriendRequestDto, PatchSocialPrivacyDto } from './dto/social-privacy.dto';

@ApiV1()
@ApiTags('好友')
@Controller('v1/friends')
export class FriendsV1Controller {
  constructor(private readonly friends: FriendsService, private readonly realtime: RealtimeEventsService) {}

  @OAuthProtected('friends.read')
  @Get()
  list(@Req() request: any) { return this.friends.getFriendsList(request.user.id); }

  @OAuthProtected('friends.read')
  @Get('requests')
  requests(@Req() request: any) { return this.friends.getPendingRequests(request.user.id); }

  @OAuthProtected('friends.read')
  @Post('requests')
  @RateLimit({ max: 30, window: 60 })
  create(@Body() body: CreateFriendRequestDto, @Req() request: any) {
    return this.createAndEmitFriendRequest(request.user.id, body.target_user_id);
  }

  private async createAndEmitFriendRequest(requesterId: number, targetUserId: number) {
    const friendship = await this.friends.sendRequest(requesterId, targetUserId);
    if (friendship.status === 'accepted') {
      await Promise.all([
        this.realtime.emitUser(friendship.requester_id, 'friend.request.accepted', { friendship_id: friendship.id, friend_user_id: friendship.addressee_id }),
        this.realtime.emitUser(friendship.addressee_id, 'friend.request.accepted', { friendship_id: friendship.id, friend_user_id: friendship.requester_id }),
      ]);
    } else {
      await this.realtime.emitUser(targetUserId, 'friend.request.created', { request_id: friendship.id, requester_user_id: requesterId });
    }
    return friendship;
  }

  @OAuthProtected('friends.read')
  @Post('requests/:id/accept')
  accept(@Param('id', ParseIntPipe) id: number, @Req() request: any) {
    return this.acceptAndEmitFriendRequest(request.user.id, id);
  }

  private async acceptAndEmitFriendRequest(userId: number, requestId: number) {
    const friendship = await this.friends.acceptRequestById(userId, requestId);
    await Promise.all([
      this.realtime.emitUser(friendship.requester_id, 'friend.request.accepted', { friendship_id: friendship.id, friend_user_id: friendship.addressee_id }),
      this.realtime.emitUser(friendship.addressee_id, 'friend.request.accepted', { friendship_id: friendship.id, friend_user_id: friendship.requester_id }),
    ]);
    return friendship;
  }

  @OAuthProtected('friends.read')
  @Post('requests/:id/reject')
  reject(@Param('id', ParseIntPipe) id: number, @Req() request: any) {
    return this.friends.rejectRequestById(request.user.id, id);
  }

  @OAuthProtected('friends.read')
  @Delete(':userId')
  remove(@Param('userId', ParseIntPipe) userId: number, @Req() request: any) {
    return this.removeFriendAndEmit(request.user.id, userId);
  }

  private async removeFriendAndEmit(viewerId: number, friendId: number) {
    await this.friends.removeFriend(viewerId, friendId);
    await Promise.all([
      this.realtime.emitUser(viewerId, 'friend.removed', { user_id: friendId }),
      this.realtime.emitUser(friendId, 'friend.removed', { user_id: viewerId }),
    ]);
    return { removed: true };
  }
}

@ApiV1()
@ApiTags('好友')
@Controller('v1/users/:id/block')
export class UserBlocksV1Controller {
  constructor(private readonly blocks: UserBlocksService) {}

  @OAuthProtected('friends.read')
  @Post()
  @RateLimit({ max: 20, window: 60 })
  block(@Param('id', ParseIntPipe) blockedId: number, @Req() request: any) {
    return this.blocks.block(request.user.id, blockedId);
  }

  @OAuthProtected('friends.read')
  @Delete()
  unblock(@Param('id', ParseIntPipe) blockedId: number, @Req() request: any) {
    return this.blocks.unblock(request.user.id, blockedId);
  }
}

@ApiV1()
@ApiTags('好友')
@Controller('v1/blocks')
export class BlocksV1Controller {
  constructor(private readonly blocks: UserBlocksService) {}

  @OAuthProtected('friends.read')
  @Get()
  list(@Req() request: any) { return this.blocks.list(request.user.id); }
}

@ApiV1()
@ApiTags('社交隐私')
@Controller('v1/social/privacy')
export class SocialPrivacyV1Controller {
  constructor(private readonly privacy: SocialPrivacyService) {}

  @OAuthProtected('presence.read')
  @Get()
  get(@Req() request: any) { return this.privacy.get(request.user.id); }

  @OAuthProtected('presence.write')
  @Patch()
  @RateLimit({ max: 30, window: 60 })
  patch(@Body() body: PatchSocialPrivacyDto, @Req() request: any) {
    return this.privacy.patch(request.user.id, body);
  }
}
