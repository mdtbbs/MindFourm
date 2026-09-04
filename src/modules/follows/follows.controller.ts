import {
  Controller, Get, Post, Delete, Param, Query, Req, UseGuards,
} from '@nestjs/common';
import { FollowsService } from './follows.service';
import { QueryFollowsDto } from './dto/follow.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';

@Controller('follows')
export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}

  @Post(':userId')
  @UseGuards(JwtAuthGuard)
  async followUser(@Param('userId') followingId: number, @Req() req: any) {
    const follow = await this.followsService.followUser(req.user.id, followingId);
    return follow;
  }

  @Delete(':userId')
  @UseGuards(JwtAuthGuard)
  async unfollowUser(@Param('userId') followingId: number, @Req() req: any) {
    await this.followsService.unfollowUser(req.user.id, followingId);
    return { message: '已取消关注' };
  }

  @Get('check/:userId')
  @UseGuards(JwtAuthGuard)
  async checkFollowStatus(@Param('userId') followingId: number, @Req() req: any) {
    const isFollowing = await this.followsService.checkFollowStatus(req.user.id, followingId);
    return { isFollowing };
  }

  @Get('user/:userId/followers')
  async getFollowers(@Param('userId') userId: number, @Query() query: QueryFollowsDto) {
    const result = await this.followsService.getFollowers(userId, query.page || 1, query.limit || 20);
    return result;
  }

  @Get('user/:userId/following')
  async getFollowing(@Param('userId') userId: number, @Query() query: QueryFollowsDto) {
    const result = await this.followsService.getFollowing(userId, query.page || 1, query.limit || 20);
    return result;
  }

  @Get('user/:userId/stats')
  async getFollowCounts(@Param('userId') userId: number) {
    const counts = await this.followsService.getFollowCounts(userId);
    return counts;
  }
}
