import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ExternalApiKeyGuard } from '@common/guards/external-api-key.guard';
import { ExternalScope } from '@common/decorators/external-scope.decorator';
import { SkipPhoneVerification } from '@common/decorators/skip-phone-verification.decorator';
import { FriendsService } from './friends.service';

@Controller('external/v1/friends')
@SkipPhoneVerification()
@UseGuards(ExternalApiKeyGuard)
export class ExternalFriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  /**
   * GET /api/external/v1/friends?user_id=N
   * Returns the friends list for the given user.
   */
  @Get()
  @ExternalScope('friends:read')
  async getFriends(
    @Query('user_id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const id = parseInt(userId, 10);
    if (!id || isNaN(id)) {
      return { ok: false, error: 'Invalid user_id' };
    }
    const result = await this.friendsService.getFriendsList(
      id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
    return {
      ok: true,
      friends: result.friends,
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /**
   * GET /api/external/v1/friends/requests?user_id=N
   * Returns pending friend requests for the given user.
   */
  @Get('requests')
  @ExternalScope('friends:read')
  async getPendingRequests(
    @Query('user_id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const id = parseInt(userId, 10);
    if (!id || isNaN(id)) {
      return { ok: false, error: 'Invalid user_id' };
    }
    const result = await this.friendsService.getPendingRequests(
      id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
    return {
      ok: true,
      requests: result.requests,
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }
}

/**
 * External user search endpoint — lives under /external/v1/users/
 * but is registered in the FriendsModule because it serves the friends feature.
 */
@Controller('external/v1/users')
@SkipPhoneVerification()
@UseGuards(ExternalApiKeyGuard)
export class ExternalUsersSearchController {
  constructor(private readonly friendsService: FriendsService) {}

  @Get('search')
  @ExternalScope('friends:read')
  async searchUsers(
    @Query('user_id') userId: string,
    @Query('q') query?: string,
    @Query('limit') limit?: string,
  ) {
    const id = parseInt(userId, 10);
    if (!id || isNaN(id)) {
      return { ok: false, error: 'Invalid user_id' };
    }
    const users = await this.friendsService.searchNonFriends(
      id,
      query || '',
      limit ? parseInt(limit, 10) : 10,
    );
    return {
      ok: true,
      users,
    };
  }
}
