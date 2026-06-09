import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query, Req } from '@nestjs/common';
import { RepliesService } from './replies.service';
import { CreateReplyDto } from './dto/create-reply.dto';
import { UpdateReplyDto } from './dto/update-reply.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('posts/:postId/replies')
export class RepliesController {
  constructor(private readonly repliesService: RepliesService) {}

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
    return this.repliesService.createReplyForPost(Number(postId), dto, userId);
  }
}

@Controller('replies')
export class RepliesControllerMain {
  constructor(private readonly repliesService: RepliesService) {}

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
    return this.repliesService.update(Number(id), dto.content, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteReply(@Param('id') id: number, @Req() req: any) {
    const userId = req.user.id;
    await this.repliesService.softDelete(Number(id), userId);
    return { message: 'Reply deleted successfully' };
  }
}
