import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query, Req } from '@nestjs/common';
import { RepliesService } from './replies.service';
import { CreateReplyDto } from './dto/create-reply.dto';
import { UpdateReplyDto } from './dto/update-reply.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LogsService } from '../logs/logs.service';
import { getClientIp, getClientRegion } from '@common/utils/client-context.util';

@Controller('posts/:postId/replies')
export class RepliesController {
  constructor(
    private readonly repliesService: RepliesService,
    private readonly logsService: LogsService,
  ) {}

  @Get()
  async getRepliesByPost(
    @Param('postId') postId: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.repliesService.getByPostId(
      Number(postId),
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async createReply(
    @Param('postId') postId: number,
    @Body() dto: CreateReplyDto,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    const reply = await this.repliesService.createReplyForPost(Number(postId), dto, userId, {
      ipAddress: getClientIp(req),
      locationLabel: getClientRegion(req),
    });
    await this.logOperation(req, 'reply.create', 'reply', reply.id, {
      post_id: Number(postId),
      status: reply.status,
    });
    return reply;
  }

  private async logOperation(req: any, action: string, targetType?: string, targetId?: number, details?: Record<string, unknown>) {
    await this.logsService.log({
      user_id: req.user?.id,
      action,
      target_type: targetType,
      target_id: targetId,
      details: details ? JSON.stringify(details) : undefined,
      ip_address: this.getClientIp(req),
      user_agent: req.headers?.['user-agent'],
    }).catch((err) => console.warn('operation log failed:', err.message));
  }

  private getClientIp(req: any): string {
    return getClientIp(req);
  }
}

@Controller('replies')
export class RepliesControllerMain {
  constructor(
    private readonly repliesService: RepliesService,
    private readonly logsService: LogsService,
  ) {}

  @Get(':id')
  async getReplyById(@Param('id') id: number) {
    return this.repliesService.findById(Number(id));
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async updateReply(
    @Param('id') id: number,
    @Body() dto: UpdateReplyDto,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    const reply = await this.repliesService.update(Number(id), dto.content, userId, req.user.role);
    await this.logOperation(req, 'reply.update', 'reply', Number(id), { post_id: reply.post_id });
    return reply;
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteReply(@Param('id') id: number, @Req() req: any) {
    const userId = req.user.id;
    await this.repliesService.softDelete(Number(id), userId, req.user.role);
    await this.logOperation(req, 'reply.delete', 'reply', Number(id));
    return { message: 'Reply deleted successfully' };
  }

  private async logOperation(req: any, action: string, targetType?: string, targetId?: number, details?: Record<string, unknown>) {
    await this.logsService.log({
      user_id: req.user?.id,
      action,
      target_type: targetType,
      target_id: targetId,
      details: details ? JSON.stringify(details) : undefined,
      ip_address: this.getClientIp(req),
      user_agent: req.headers?.['user-agent'],
    }).catch((err) => console.warn('operation log failed:', err.message));
  }

  private getClientIp(req: any): string {
    return getClientIp(req);
  }
}
