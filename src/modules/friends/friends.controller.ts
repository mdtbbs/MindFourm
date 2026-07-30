import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { FriendsService } from './friends.service';
import { QueryFriendsDto, SearchFriendsDto } from './dto/friend.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Post('request/:userId')
  async sendRequest(
    @Param('userId', ParseIntPipe) targetId: number,
    @Req() req: any,
  ) {
    const friendship = await this.friendsService.sendRequest(req.user.id, targetId);
    return { message: '好友请求已发送', friendship };
  }

  @Post('accept/:userId')
  async acceptRequest(
    @Param('userId', ParseIntPipe) requesterId: number,
    @Req() req: any,
  ) {
    const friendship = await this.friendsService.acceptRequest(req.user.id, requesterId);
    return { message: '已接受好友请求', friendship };
  }

  @Post('reject/:userId')
  async rejectRequest(
    @Param('userId', ParseIntPipe) requesterId: number,
    @Req() req: any,
  ) {
    await this.friendsService.rejectRequest(req.user.id, requesterId);
    return { message: '已拒绝好友请求' };
  }

  @Post('cancel/:userId')
  async cancelRequest(
    @Param('userId', ParseIntPipe) targetId: number,
    @Req() req: any,
  ) {
    await this.friendsService.cancelRequest(req.user.id, targetId);
    return { message: '已取消好友请求' };
  }

  @Delete(':userId')
  async removeFriend(
    @Param('userId', ParseIntPipe) friendId: number,
    @Req() req: any,
  ) {
    await this.friendsService.removeFriend(req.user.id, friendId);
    return { message: '已删除好友' };
  }

  @Get('requests')
  async getPendingRequests(@Query() query: QueryFriendsDto, @Req() req: any) {
    return this.friendsService.getPendingRequests(
      req.user.id,
      query.page || 1,
      query.limit || 20,
    );
  }

  @Get('search')
  async searchNonFriends(@Query() query: SearchFriendsDto, @Req() req: any) {
    return this.friendsService.searchNonFriends(
      req.user.id,
      query.q || '',
      query.limit || 10,
    );
  }

  @Get('check/:userId')
  async checkStatus(
    @Param('userId', ParseIntPipe) targetId: number,
    @Req() req: any,
  ) {
    const status = await this.friendsService.getPendingStatus(req.user.id, targetId);
    return { status };
  }

  @Get()
  async getFriendsList(@Query() query: QueryFriendsDto, @Req() req: any) {
    return this.friendsService.getFriendsList(
      req.user.id,
      query.page || 1,
      query.limit || 20,
    );
  }
}
