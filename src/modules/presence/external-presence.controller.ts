import {
  Controller,
  Get,
  Put,
  Delete,
  Query,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ExternalApiKeyGuard } from '@common/guards/external-api-key.guard';
import { ExternalScope } from '@common/decorators/external-scope.decorator';
import { SkipPhoneVerification } from '@common/decorators/skip-phone-verification.decorator';
import { PresenceService } from './presence.service';
import { PresenceData } from './presence.data';

@Controller('external/v1/presence')
@SkipPhoneVerification()
@UseGuards(ExternalApiKeyGuard)
export class ExternalPresenceController {
  constructor(private readonly presenceService: PresenceService) {}

  /**
   * GET /api/external/v1/presence?user_ids=1,2,3
   * Batch query presence data for multiple users.
   */
  @Get()
  @ExternalScope('presence:read')
  async getPresences(@Query('user_ids') userIdsStr: string) {
    if (!userIdsStr) {
      return { ok: false, error: 'Missing user_ids query parameter' };
    }

    const userIds = userIdsStr
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((id) => !isNaN(id) && id > 0);

    if (userIds.length === 0) {
      return { ok: false, error: 'No valid user_ids provided' };
    }

    const presences = await this.presenceService.getPresences(userIds);
    const result: Record<string, PresenceData> = {};
    for (const [id, data] of presences.entries()) {
      result[String(id)] = data;
    }

    return {
      ok: true,
      presences: result,
    };
  }

  /**
   * PUT /api/external/v1/presence/:userId
   * Set presence data for a user. Called by LanLink when status changes.
   */
  @Put(':userId')
  @ExternalScope('presence:write')
  async setPresence(
    @Param('userId') userId: string,
    @Body() body: PresenceData,
  ) {
    const id = parseInt(userId, 10);
    if (!id || isNaN(id)) {
      return { ok: false, error: 'Invalid userId' };
    }

    if (!body || !body.status) {
      return { ok: false, error: 'Missing status in body' };
    }

    const validStatuses = ['online', 'hosting', 'playing', 'offline'];
    if (!validStatuses.includes(body.status)) {
      return { ok: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` };
    }

    await this.presenceService.setPresence(id, {
      ...body,
      updated_at: body.updated_at || Date.now(),
    });

    return { ok: true };
  }

  /**
   * DELETE /api/external/v1/presence/:userId
   * Delete presence data for a user (typically when going offline).
   */
  @Delete(':userId')
  @ExternalScope('presence:write')
  async deletePresence(@Param('userId') userId: string) {
    const id = parseInt(userId, 10);
    if (!id || isNaN(id)) {
      return { ok: false, error: 'Invalid userId' };
    }

    await this.presenceService.deletePresence(id);
    return { ok: true };
  }
}
