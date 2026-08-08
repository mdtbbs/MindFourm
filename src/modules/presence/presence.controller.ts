import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PresenceService } from './presence.service';
import { PresenceData } from './presence.data';

@Controller('presence')
@UseGuards(JwtAuthGuard)
export class PresenceController {
  constructor(private readonly presenceService: PresenceService) {}

  /**
   * GET /api/presence?user_ids=1,2,3
   * Batch query presence data for multiple users.
   * Requires authentication.
   */
  @Get()
  async getPresences(@Query('user_ids') userIdsStr: string) {
    if (!userIdsStr) {
      return { success: false, message: 'Missing user_ids query parameter' };
    }

    const userIds = userIdsStr
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((id) => !isNaN(id) && id > 0);

    if (userIds.length === 0) {
      return { success: false, message: 'No valid user_ids provided' };
    }

    const presences = await this.presenceService.getPresences(userIds);
    const result: Record<string, PresenceData> = {};
    for (const [id, data] of presences.entries()) {
      result[String(id)] = data;
    }

    return {
      success: true,
      data: result,
    };
  }
}
