import {
  Controller, Get, Post, Delete, Param, Query, UseGuards, Req, ParseIntPipe, Header,
} from '@nestjs/common';
import { parseBatchIds } from '@common/utils/batch-targets.util';
import { LikesService } from './likes.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { Public, OptionalAuth } from '@common/decorators/public.decorator';
import type { Request } from 'express';

@Controller('likes')
export class LikesController {
  constructor(private readonly likesService: LikesService) {}

  @Get('posts/batch')
  @Header('Cache-Control', 'private, no-store')
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async postBatch(@Query('ids') ids: string, @Req() req: Request) {
    return this.likesService.getForTargets('post', parseBatchIds(ids), (req as any).user);
  }

  @Get('replies/batch')
  @Header('Cache-Control', 'private, no-store')
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async replyBatch(@Query('ids') ids: string, @Req() req: Request) {
    return this.likesService.getForTargets('reply', parseBatchIds(ids), (req as any).user);
  }

  @Post('posts/:postId')
  @UseGuards(JwtAuthGuard)
  async likePost(@Param('postId', ParseIntPipe) postId: number, @Req() req: Request) {
    await this.likesService.likePost((req as any).user?.id, postId);
    return { message: 'Post liked successfully' };
  }

  @Delete('posts/:postId')
  @UseGuards(JwtAuthGuard)
  async unlikePost(@Param('postId', ParseIntPipe) postId: number, @Req() req: Request) {
    await this.likesService.unlikePost((req as any).user?.id, postId);
    return { message: 'Post unliked successfully' };
  }

  /**
   * Like count for a post, plus whether the *caller* liked it.
   *
   * The liked flag comes from the session. Accepting `?userId=` here let anyone
   * probe whether a given user had liked a given post.
   */
  @Get('posts/:postId')
  @Header('Cache-Control', 'private, no-store')
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async checkPostLike(@Param('postId', ParseIntPipe) postId: number, @Req() req: Request) {
    return (await this.likesService.getForTargets('post', [postId], (req as any).user))[postId] ?? { liked: false, count: 0 };
  }

  @Get('posts')
  @UseGuards(JwtAuthGuard)
  async getUserLikedPosts(@Req() req: Request, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.likesService.getUserLikedPosts((req as any).user?.id, Number(page), Number(limit));
  }

  @Post('replies/:replyId')
  @UseGuards(JwtAuthGuard)
  async likeReply(@Param('replyId', ParseIntPipe) replyId: number, @Req() req: Request) {
    await this.likesService.likeReply((req as any).user?.id, replyId);
    return { message: 'Reply liked successfully' };
  }

  @Delete('replies/:replyId')
  @UseGuards(JwtAuthGuard)
  async unlikeReply(@Param('replyId', ParseIntPipe) replyId: number, @Req() req: Request) {
    await this.likesService.unlikeReply((req as any).user?.id, replyId);
    return { message: 'Reply unliked successfully' };
  }

  @Get('replies/:replyId')
  @Header('Cache-Control', 'private, no-store')
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async checkReplyLike(@Param('replyId', ParseIntPipe) replyId: number, @Req() req: Request) {
    return (await this.likesService.getForTargets('reply', [replyId], (req as any).user))[replyId] ?? { liked: false, count: 0 };
  }

  @Get('users/:userId/count')
  @Public()
  async getUserReceivedLikeCount(@Param('userId', ParseIntPipe) userId: number) {
    return { count: await this.likesService.getUserReceivedLikeCount(userId) };
  }
}
