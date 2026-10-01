import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '@common/decorators/api-v1.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { getClientIp } from '@common/utils/client-context.util';
import { NoticesService } from './notices.service';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { UpdateNoticeDto } from './dto/update-notice.dto';
import { NOTICE_TYPES } from '@entities/notice.entity';

const NOTICE_SUMMARY_SCHEMA: any = {
  type: 'object', required: ['id', 'public_id', 'slug', 'title', 'excerpt', 'notice_type', 'is_pinned', 'published_at', 'edited_at', 'view_count', 'author'],
  properties: {
    id: { type: 'integer', example: 12, description: '公告 ID；兼容期间可使用数据库 ID。' },
    public_id: { type: 'string', example: 'notice-uuid', description: '公告稳定公开标识。' },
    slug: { type: 'string', nullable: true, example: 'server-maintenance', description: '公告 URL slug。' },
    title: { type: 'string', example: '服务器维护通知', description: '公告标题。' },
    excerpt: { type: 'string', nullable: true, example: '服务将于今晚维护。', description: '公告摘要。' },
    notice_type: { type: 'string', enum: [...NOTICE_TYPES], example: 'maintenance', description: '公告类型。' },
    is_pinned: { type: 'boolean', example: true, description: '是否置顶。' },
    published_at: { type: 'string', format: 'date-time', nullable: true, example: '2026-09-30T12:00:00.000Z', description: '发布时间。' },
    edited_at: { type: 'string', format: 'date-time', nullable: true, example: null, description: '最近编辑时间。' },
    view_count: { type: 'integer', example: 245, description: '浏览次数。' },
    author: { type: 'object', nullable: true, description: '发布者公开资料。', properties: {
      id: { type: 'integer', example: 1, description: '用户 ID。' },
      username: { type: 'string', example: 'admin', description: '用户名。' },
      avatar_url: { type: 'string', nullable: true, example: null, description: '头像 URL。' },
      role: { type: 'string', example: 'admin', description: '论坛角色。' },
    } },
  },
};

const NOTICE_DETAIL_SCHEMA: any = {
  ...NOTICE_SUMMARY_SCHEMA,
  required: [...NOTICE_SUMMARY_SCHEMA.required, 'status', 'content_markdown', 'content_html', 'created_at', 'updated_at', 'revisions', 'related'],
  properties: {
    ...NOTICE_SUMMARY_SCHEMA.properties,
    status: { type: 'string', example: 'published', description: '公告状态。公开详情只允许读取已发布公告。' },
    content_markdown: { type: 'string', example: '维护窗口为今晚 22:00。', description: '公告 Markdown 正文。' },
    content_html: { type: 'string', example: '<p>维护窗口为今晚 22:00。</p>', description: '服务端渲染的安全 HTML。' },
    created_at: { type: 'string', format: 'date-time', example: '2026-09-29T10:00:00.000Z', description: '创建时间。' },
    updated_at: { type: 'string', format: 'date-time', example: '2026-09-29T10:00:00.000Z', description: '最后更新时间。' },
    revisions: { type: 'array', description: '最近 10 条修订记录。', items: { type: 'object', required: ['id', 'change_summary', 'created_at', 'editor'], properties: {
      id: { type: 'integer', example: 99, description: '修订记录 ID。' },
      change_summary: { type: 'string', nullable: true, example: '修正维护时段', description: '编辑者填写的修改摘要。' },
      created_at: { type: 'string', format: 'date-time', example: '2026-09-29T10:00:00.000Z', description: '修订时间。' },
      editor: { type: 'object', nullable: true, description: '修订者公开资料。' },
    } } },
    related: { type: 'array', description: '同类型的相关公告摘要。', items: NOTICE_SUMMARY_SCHEMA },
  },
};

@ApiV1()
@ApiTags('v1-notices')
@Controller('v1/notices')
export class NoticesController {
  constructor(private readonly noticesService: NoticesService) {}
  @Get()
  @ApiQuery({ name: 'limit', required: false, type: Number, schema: { minimum: 1, maximum: 50 }, example: 20, description: '每页公告数；默认 20，最大 50。' })
  @ApiQuery({ name: 'offset', required: false, type: Number, schema: { minimum: 0 }, example: 0, description: '从列表开头跳过的公告数。' })
  @ApiQuery({ name: 'type', required: false, enum: [...NOTICE_TYPES], example: 'system', description: '按公告类型筛选。' })
  @ApiQuery({ name: 'pinned', required: false, enum: ['true', 'false'], example: 'true', description: '只看置顶公告（true）或非置顶公告（false）。' })
  @ApiOkResponse({ description: '已发布公告列表；游标与计数信息嵌套在 data.pagination。', schema: { type: 'object', required: ['data', 'pagination'], properties: {
    data: { type: 'array', items: NOTICE_SUMMARY_SCHEMA, description: '当前页公告。' },
    pagination: { type: 'object', required: ['limit', 'offset', 'next_offset', 'has_more'], properties: {
      limit: { type: 'integer', example: 20, description: '本页条数上限。' },
      offset: { type: 'integer', example: 0, description: '当前起始偏移量。' },
      next_offset: { type: 'integer', nullable: true, example: 20, description: '下一页起始位置；null 表示没有下一页。' },
      has_more: { type: 'boolean', example: true, description: '是否还有下一页。' },
    } },
  } } })
  list(@Query('limit') limit?: string, @Query('offset') offset?: string, @Query('type') type?: any, @Query('pinned') pinned?: string) {
    return this.noticesService.listPublic({ limit: Number(limit) || 20, offset: Number(offset) || undefined, type, pinned: pinned === undefined ? undefined : pinned === 'true' });
  }
  @Get(':id')
  @ApiOkResponse({ description: '公告详情、修订记录和相关公告。', schema: NOTICE_DETAIL_SCHEMA })
  detail(@Param('id') id: string, @Req() req: any) { return this.noticesService.getPublic(id, getClientIp(req)); }
}

@ApiV1()
@ApiTags('v1-admin-notices')
@Controller('v1/admin/notices')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminNoticesController {
  constructor(private readonly noticesService: NoticesService) {}
  @Get()
  @ApiOkResponse({ description: '管理员公告列表。', schema: { type: 'array', items: NOTICE_DETAIL_SCHEMA } })
  list() { return this.noticesService.listAdmin(); }

  @Post()
  @ApiCreatedResponse({ description: '公告已创建。', schema: NOTICE_DETAIL_SCHEMA })
  create(@Body() dto: CreateNoticeDto, @Req() req: any) { return this.noticesService.create(dto, req.user.id, { ip: getClientIp(req), userAgent: req.headers?.['user-agent'] }); }

  @Patch(':id')
  @ApiOkResponse({ description: '公告已更新。', schema: NOTICE_DETAIL_SCHEMA })
  update(@Param('id') id: string, @Body() dto: UpdateNoticeDto, @Req() req: any) { return this.noticesService.update(id, dto, req.user.id, { ip: getClientIp(req), userAgent: req.headers?.['user-agent'] }); }

  @Delete(':id')
  @ApiOkResponse({ description: '公告已软删除。', schema: { type: 'object', required: ['message'], properties: { message: { type: 'string', example: '公告已删除', description: '操作结果。' } } } })
  async remove(@Param('id') id: string, @Req() req: any) { await this.noticesService.softDelete(id, req.user.id, { ip: getClientIp(req), userAgent: req.headers?.['user-agent'] }); return { message: '公告已删除' }; }
}
