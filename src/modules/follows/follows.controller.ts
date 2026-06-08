import {
  Controller, Get, Post, Delete, Param, Query, Body, UseGuards,
} from '@nestjs/common';
import { FollowsService } from './follows.service';
import { QueryFollowsDto, FollowUserDto } from './dto/follow.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';

@Controller('follows')
export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}

  @Post(':userId')
  @UseGuards(JwtAuthGuard)
  async followUser(@Param('userId') followingId: number, @Body() dto: FollowUserDto) {
    const follow = await this.followsService.followUser(dto.followerId, followingId);
    return { success: true, data: follow };
  }

  @Delete(':userId')
  @UseGuards(JwtAuthGuard)
  async unfollowUser(@Param('userId') followingId: number, @Query('followerId') followerId: number) {
    await this.followsService.unfollowUser(followerId, followingId);
    return { success: true, data: { message: '已取消关注' } };
  }

  @Get('check/:userId')
  @UseGuards(JwtAuthGuard)
  async checkFollowStatus(@Param('userId') followingId: number, @Query('followerId') followerId: number) {
    const isFollowing = await this.followsService.checkFollowStatus(followerId, followingId);
    return { success: true, data: { isFollowing } };
  }

  @Get('user/:userId/followers')
  async getFollowers(@Param('userId') userId: number, @Query() query: QueryFollowsDto) {
    const result = await this.followsService.getFollowers(userId, query.page || 1, query.limit || 20);
    return { success: true, data: result };
  }

  @Get('user/:userId/following')
  async getFollowing(@Param('userId') userId: number, @Query() query: QueryFollowsDto) {
    const result = await this.followsService.getFollowing(userId, query.page || 1, query.limit || 20);
    return { success: true, data: result };
  }

  @Get('user/:userId/stats')
  async getFollowCounts(@Param('userId') userId: number) {
    const counts = await this.followsService.getFollowCounts(userId);
    return { success: true, data: counts };
  }
}
