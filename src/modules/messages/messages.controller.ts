import {
  Controller, Get, Post, Put, Delete, Param, Query, UseGuards, Req, ParseIntPipe, Body,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CreateGroupChatDto } from './dto/create-group-chat.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { GroupMessageDto } from './dto/group-message.dto';
import { AddGroupChatMemberDto } from './dto/add-group-chat-member.dto';
import { UpdateGroupChatDto } from './dto/update-group-chat.dto';
import type { Request } from 'express';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  async send(@Body() dto: CreateMessageDto, @Req() req: Request) {
    return this.messagesService.create(dto, (req as any).user?.id);
  }

  @Get()
  async getConversations(@Req() req: Request, @Query('limit') limit = '20', @Query('cursor') cursor?: string) {
    // The service clamps the limit; passing the raw value keeps NaN handling in one place.
    return this.messagesService.getConversations((req as any).user?.id, limit, cursor);
  }

  @Get('unread-count')
  async unreadCount(@Req() req: Request) {
    return { count: await this.messagesService.getUnreadCount((req as any).user?.id) };
  }

  @Get(':userId')
  async getConversation(@Req() req: Request, @Param('userId', ParseIntPipe) userId: number, @Query('limit') limit = '50', @Query('cursor') cursor?: string) {
    return this.messagesService.getConversation((req as any).user?.id, userId, limit, cursor);
  }

  @Delete(':id')
  async deleteMessage(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.messagesService.deleteForUser(id, (req as any).user?.id);
  }
}

// Group Chat Controller
@Controller('group-chats')
@UseGuards(JwtAuthGuard)
export class GroupChatsController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  async createGroupChat(@Body() dto: CreateGroupChatDto, @Req() req: Request) {
    const groupChat = await this.messagesService.createGroupChat(dto, (req as any).user?.id);
    return { success: true, data: groupChat };
  }

  @Get()
  async getMyGroupChats(@Req() req: Request) {
    const groupChats = await this.messagesService.getMyGroupChats((req as any).user?.id);
    return { success: true, data: groupChats };
  }

  @Get(':id')
  async getGroupChat(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const groupChat = await this.messagesService.getGroupChat(id, (req as any).user?.id);
    return { success: true, data: groupChat };
  }

  @Get(':id/messages')
  async getGroupMessages(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
    @Query('limit') limit = '50',
    @Query('cursor') cursor?: string,
  ) {
    return this.messagesService.getGroupMessages(id, (req as any).user?.id, limit, cursor);
  }

  @Post(':id/messages')
  async sendGroupMessage(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GroupMessageDto,
    @Req() req: Request,
  ) {
    const message = await this.messagesService.sendGroupMessage(id, (req as any).user?.id, dto.content);
    return { success: true, data: message };
  }

  @Post(':id/members')
  async addGroupMember(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddGroupChatMemberDto,
    @Req() req: Request,
  ) {
    const member = await this.messagesService.addGroupMember(
      id,
      (req as any).user?.id,
      dto.user_id,
      dto.role || 'member',
    );
    return { success: true, data: member };
  }

  @Delete(':id/members/:userId')
  async removeGroupMember(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: Request,
  ) {
    await this.messagesService.removeGroupMember(id, (req as any).user?.id, userId);
    return { success: true, data: { message: '成员已移除' } };
  }

  @Post(':id/leave')
  async leaveGroupChat(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    await this.messagesService.leaveGroupChat(id, (req as any).user?.id);
    return { success: true, data: { message: '已离开群聊' } };
  }

  @Put(':id')
  async updateGroupChat(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGroupChatDto,
    @Req() req: Request,
  ) {
    const groupChat = await this.messagesService.updateGroupChat(id, (req as any).user?.id, dto);
    return { success: true, data: groupChat };
  }
}
