import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '@common/decorators/api-v1.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { getClientIp } from '@common/utils/client-context.util';
import { NoticesService } from './notices.service';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { UpdateNoticeDto } from './dto/update-notice.dto';

@ApiV1()
@ApiTags('v1-notices')
@Controller('v1/notices')
export class NoticesController {
  constructor(private readonly noticesService: NoticesService) {}
  @Get() @ApiOkResponse({ description: 'Published notice list' })
  list(@Query('limit') limit?: string, @Query('offset') offset?: string, @Query('type') type?: any, @Query('pinned') pinned?: string) {
    return this.noticesService.listPublic({ limit: Number(limit) || 20, offset: Number(offset) || undefined, type, pinned: pinned === undefined ? undefined : pinned === 'true' });
  }
  @Get(':id')
  detail(@Param('id') id: string, @Req() req: any) { return this.noticesService.getPublic(id, getClientIp(req)); }
}

@ApiV1()
@ApiTags('v1-admin-notices')
@Controller('v1/admin/notices')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminNoticesController {
  constructor(private readonly noticesService: NoticesService) {}
  @Get() list() { return this.noticesService.listAdmin(); }
  @Post() create(@Body() dto: CreateNoticeDto, @Req() req: any) { return this.noticesService.create(dto, req.user.id, { ip: getClientIp(req), userAgent: req.headers?.['user-agent'] }); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateNoticeDto, @Req() req: any) { return this.noticesService.update(id, dto, req.user.id, { ip: getClientIp(req), userAgent: req.headers?.['user-agent'] }); }
  @Delete(':id') async remove(@Param('id') id: string, @Req() req: any) { await this.noticesService.softDelete(id, req.user.id, { ip: getClientIp(req), userAgent: req.headers?.['user-agent'] }); return { message: '公告已删除' }; }
}
