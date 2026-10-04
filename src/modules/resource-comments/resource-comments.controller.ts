import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  Request,
  Optional,
} from '@nestjs/common';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { ResourceCommentsService } from './resource-comments.service';
import { CreateResourceCommentDto } from './dto/create-resource-comment.dto';
import { UpdateResourceCommentDto } from './dto/update-resource-comment.dto';
import { Public } from '@common/decorators/public.decorator';
import { getClientIp, getClientRegion } from '@common/utils/client-context.util';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { CommunityChallengeService } from '../community-challenges/community-challenge.service';

@Controller()
export class ResourceCommentsController {
  constructor(
    private readonly service: ResourceCommentsService,
    @Optional() private readonly communityChallenge?: CommunityChallengeService,
  ) {}

  @Get('resources/:id/comments')
  @Public()
  async getComments(
    @Param('id') resourceId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.service.findByResource(
      parseInt(resourceId),
      parseInt(page),
      parseInt(limit),
    );
  }

  @Post('resources/:id/comments')
  @UseGuards(JwtAuthGuard)
  @RateLimit({ max: 20, window: 60 })
  async createComment(
    @Param('id') resourceId: string,
    @Body() dto: CreateResourceCommentDto,
    @Request() req,
  ) {
    const ipAddress = getClientIp(req);
    await this.communityChallenge?.enforceContentAction({
      action: 'forum.reply.create',
      text: dto.content || '',
      actorId: req.user.id,
      remoteIp: ipAddress,
      proof: {
        token: req.headers?.['x-forum-challenge-token'],
        response: req.headers?.['x-forum-challenge-response'],
      },
    });
    return this.service.create(parseInt(resourceId), req.user.id, dto, {
      ipAddress,
      locationLabel: getClientRegion(req),
    });
  }

  @Put('resource-comments/:id')
  @UseGuards(JwtAuthGuard)
  async updateComment(
    @Param('id') id: string,
    @Body() dto: UpdateResourceCommentDto,
    @Request() req,
  ) {
    return this.service.update(parseInt(id), req.user.id, dto, req.user.role);
  }

  @Delete('resource-comments/:id')
  @UseGuards(JwtAuthGuard)
  async deleteComment(@Param('id') id: string, @Request() req) {
    return this.service.delete(
      parseInt(id),
      req.user.id,
      req.user.role,
    );
  }

  @Post('resource-comments/:id/like')
  @UseGuards(JwtAuthGuard)
  async likeComment(@Param('id') id: string, @Req() req: any) {
    await this.service.incrementLike(parseInt(id), req.user.id);
    return { success: true };
  }

  @Delete('resource-comments/:id/like')
  @UseGuards(JwtAuthGuard)
  async unlikeComment(@Param('id') id: string, @Req() req: any) {
    await this.service.decrementLike(parseInt(id), req.user.id);
    return { success: true };
  }
}
