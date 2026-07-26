import {
  Controller, Get, Post, Delete, Param, Query, UseGuards, Req, ParseIntPipe,
} from '@nestjs/common';
import { LikesService } from './likes.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { Public, OptionalAuth } from '@common/decorators/public.decorator';
import type { Request } from 'express';

@Controller('likes')
export class LikesController {
  constructor(private readonly likesService: LikesService) {}

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
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async checkPostLike(@Param('postId', ParseIntPipe) postId: number, @Req() req: Request) {
    const uid = (req as any).user?.id;
    const isLiked = uid ? await this.likesService.isPostLiked(uid, postId) : false;
    const likeCount = await this.likesService.getPostLikeCount(postId);
    return { liked: isLiked, count: likeCount };
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
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async checkReplyLike(@Param('replyId', ParseIntPipe) replyId: number, @Req() req: Request) {
    const uid = (req as any).user?.id;
    const isLiked = uid ? await this.likesService.isReplyLiked(uid, replyId) : false;
    const likeCount = await this.likesService.getReplyLikeCount(replyId);
    return { liked: isLiked, count: likeCount };
  }

  @Get('users/:userId/count')
  @Public()
  async getUserReceivedLikeCount(@Param('userId', ParseIntPipe) userId: number) {
    return { count: await this.likesService.getUserReceivedLikeCount(userId) };
  }
}
