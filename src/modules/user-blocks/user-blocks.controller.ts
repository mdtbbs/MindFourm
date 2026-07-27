import {
  Controller, Get, Post, Delete, Body, Param, Query, Req, UseGuards, ParseIntPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserBlocksService } from './user-blocks.service';
import { CreateUserBlockDto, QueryUserBlocksDto } from './dto/user-block.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: { id: number };
}

@Controller('user-blocks')
@UseGuards(JwtAuthGuard)
export class UserBlocksController {
  constructor(private readonly userBlocksService: UserBlocksService) {}

  // The blocker is read from the session on every route: accepting it from the body
  // or query would let any authenticated caller manage another user's block list.
  @Post()
  async block(@Body() dto: CreateUserBlockDto, @Req() req: AuthenticatedRequest) {
    return this.userBlocksService.block(req.user.id, dto.blocked_id, dto.reason);
  }

  @Delete(':blockedId')
  async unblock(
    @Param('blockedId', ParseIntPipe) blockedId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.userBlocksService.unblock(req.user.id, blockedId);
    return { message: '已取消拉黑' };
  }

  @Get()
  async list(@Query() query: QueryUserBlocksDto, @Req() req: AuthenticatedRequest) {
    return this.userBlocksService.list(req.user.id, query.page ?? 1, query.limit ?? 20);
  }
}
