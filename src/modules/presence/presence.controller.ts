import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { Public } from '@common/decorators/public.decorator';
import { PresenceService } from './presence.service';
import { PresenceData } from './presence.data';
import { StaffPresenceService } from './staff-presence.service';

@Controller('presence')
@UseGuards(JwtAuthGuard)
export class PresenceController {
  constructor(
    private readonly presenceService: PresenceService,
    private readonly staffPresenceService: StaffPresenceService,
  ) {}

  /** Public status only for accounts that can moderate the forum. */
  @Get('staff')
  @Public()
  async getStaffPresence() {
    // The global response interceptor provides the API envelope. Returning a
    // second one here would make SSR clients receive an object instead of the
    // advertised staff array.
    return this.staffPresenceService.list();
  }

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
