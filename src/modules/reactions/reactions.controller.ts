import {
  Controller, Get, Post, Body, Param, Req, UseGuards, ParseIntPipe, Query, Header,
} from '@nestjs/common';
import type { Request } from 'express';
import { parseBatchIds } from '@common/utils/batch-targets.util';
import { ReactionsService } from './reactions.service';
import { ToggleReactionDto } from './dto/toggle-reaction.dto';
import { REACTION_EMOJIS } from './reaction-emojis';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { Public, OptionalAuth } from '@common/decorators/public.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';

interface MaybeAuthenticatedRequest extends Request {
  user?: { id: number; role: string };
}

@Controller('reactions')
export class ReactionsController {
  constructor(private readonly reactionsService: ReactionsService) {}

  @Get('emojis')
  @Public()
  getEmojis() {
    return { emojis: REACTION_EMOJIS };
  }

  @Post(':targetType/:targetId')
  @UseGuards(JwtAuthGuard)
  @RateLimit({ max: 60, window: 60 })
  async toggle(
    @Param('targetType') targetType: string,
    @Param('targetId', ParseIntPipe) targetId: number,
    @Body() dto: ToggleReactionDto,
    @Req() req: MaybeAuthenticatedRequest,
  ) {
    const reactions = await this.reactionsService.toggle(
      req.user!.id,
      targetType,
      targetId,
      dto.emoji,
    );
    return { reactions };
  }

  @Get(':targetType/batch')
  @Header('Cache-Control', 'private, no-store')
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getBatch(@Param('targetType') type: string, @Query('ids') ids: string, @Req() req: MaybeAuthenticatedRequest) {
    return { reactions: await this.reactionsService.getVisibleForTargets(type, parseBatchIds(ids), req.user) };
  }

  /**
   * Public, but the `reacted` flag comes from the session when there is one.
   *
   * Never from a query parameter: that would let anyone probe whether a given user
   * had reacted to a given post.
   */
  @Get(':targetType/:targetId')
  @Header('Cache-Control', 'private, no-store')
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getForTarget(
    @Param('targetType') targetType: string,
    @Param('targetId', ParseIntPipe) targetId: number,
    @Req() req: MaybeAuthenticatedRequest,
  ) {
    const reactions = await this.reactionsService.getVisibleForTargets(targetType, [targetId], req.user);
    return { reactions: reactions[targetId] ?? [] };
  }
}
