import {
  Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { CreateGroupDto, UpdateGroupDto, AddGroupMemberDto, QueryGroupsDto } from './dto/group.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';

@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  // === Public endpoints ===

  @Get()
  async getAllGroups() {
    const groups = await this.groupsService.getAllGroups();
    return { success: true, data: groups };
  }

  @Get(':slug')
  async getGroupBySlug(@Param('slug') slug: string) {
    const group = await this.groupsService.getGroupBySlug(slug);
    return { success: true, data: group };
  }

  @Get(':slug/members')
  async getGroupMembers(@Param('slug') slug: string, @Query() query: QueryGroupsDto) {
    const result = await this.groupsService.getGroupMembers(slug, query.page || 1, query.limit || 20);
    return { success: true, data: result };
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  async joinGroup(@Param('id') id: number, @Query('userId') userId: number) {
    const member = await this.groupsService.joinGroup(id, userId);
    return { success: true, data: member };
  }

  @Post(':id/leave')
  @UseGuards(JwtAuthGuard)
  async leaveGroup(@Param('id') id: number, @Query('userId') userId: number) {
    await this.groupsService.leaveGroup(id, userId);
    return { success: true, data: { message: '已离开该组' } };
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  async getMyGroups(@Query('userId') userId: number) {
    const groups = await this.groupsService.getMyGroups(userId);
    return { success: true, data: groups };
  }

  // === Admin endpoints ===

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async adminGetAllGroups() {
    const groups = await this.groupsService.adminGetAllGroups();
    return { success: true, data: groups };
  }

  @Post('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async adminCreateGroup(@Body() dto: CreateGroupDto) {
    const group = await this.groupsService.adminCreateGroup(dto);
    return { success: true, data: group };
  }

  @Put('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async adminUpdateGroup(@Param('id') id: number, @Body() dto: UpdateGroupDto) {
    const group = await this.groupsService.adminUpdateGroup(id, dto);
    return { success: true, data: group };
  }

  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async adminDeleteGroup(@Param('id') id: number) {
    await this.groupsService.adminDeleteGroup(id);
    return { success: true, data: { message: '组已删除' } };
  }

  @Post('admin/:id/members')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async adminAddMember(@Param('id') id: number, @Body() dto: AddGroupMemberDto) {
    const member = await this.groupsService.adminAddMember(id, dto.user_id, dto.role || 'member');
    return { success: true, data: member };
  }

  @Delete('admin/:id/members/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async adminRemoveMember(@Param('id') id: number, @Param('userId') userId: number) {
    await this.groupsService.adminRemoveMember(id, userId);
    return { success: true, data: { message: '成员已移除' } };
  }
}
