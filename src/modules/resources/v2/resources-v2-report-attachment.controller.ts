import {
  BadRequestException, Controller, Delete, Get, Param, Post, Req, Res,
  StreamableFile, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import * as path from 'path';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import {
  ApiBadRequestResponse, ApiBody, ApiConsumes, ApiCreatedResponse, ApiForbiddenResponse,
  ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiProduces, ApiTags,
  ApiResponse, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiV1, RawHttpResponse } from '@common/decorators/api-v1.decorator';
import { OAuthProtected } from '@common/decorators/oauth-protected.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { attachmentContentDisposition } from '@common/utils/content-disposition.util';
import { cleanupUploadedFile } from '../resources.controller';
import {
  MAX_MOD_REPORT_ATTACHMENT_BYTES, ModReportType, ResourceV2ReportAttachmentService,
} from './resource-v2-report-attachment.service';
import {
  ResourceV2ReportAttachmentDeleteDto, ResourceV2ReportAttachmentDto, ResourceV2ReportAttachmentListDto,
} from './resources-v2-report-attachment.dto';

const REPORT_ATTACHMENT_INCOMING_DIR = path.join(
  path.resolve(process.env.RESOURCE_UPLOAD_ROOT || './uploads'),
  '.quarantine', 'resources', '.incoming',
);
const ALLOWED_REPORT_ATTACHMENT_EXTENSIONS = new Set([
  '.log', '.txt', '.json', '.crash', '.png', '.jpg', '.jpeg', '.gif', '.webp',
]);

export const modReportAttachmentUploadInterceptor = FileInterceptor('file', {
  storage: diskStorage({
    destination: (_req, _file, callback) => {
      mkdirSync(REPORT_ATTACHMENT_INCOMING_DIR, { recursive: true });
      callback(null, REPORT_ATTACHMENT_INCOMING_DIR);
    },
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: MAX_MOD_REPORT_ATTACHMENT_BYTES, files: 1, fields: 0 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_REPORT_ATTACHMENT_EXTENSIONS.has(extname(file.originalname).toLowerCase())) {
      callback(new BadRequestException('只允许 PNG/JPEG/GIF/WebP 图片或 TXT/LOG/JSON/CRASH 日志'), false);
      return;
    }
    callback(null, true);
  },
});

@ApiV1()
@ApiTags('v1-resources-report-attachments')
@Controller('v1/resources/mods')
export class ResourcesV2ReportAttachmentController {
  constructor(private readonly attachments: ResourceV2ReportAttachmentService) {}

  @Post('issue-reports/:reportId/attachments')
  @OAuthProtected('resource.upload')
  @UseInterceptors(modReportAttachmentUploadInterceptor)
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({ operationId: 'uploadModIssueReportAttachmentV2', summary: '为本人 Mod 问题报告上传私有日志或图片证据', description: '手机号验证后的报告提交者可上传；附件保持在私有隔离存储，只能由报告提交者、相关 Owner/Maintainer/Publisher 或审核人员读取。请先清除 IP、令牌、用户名、本机路径和其他隐私信息。' })
  @ApiParam({ name: 'reportId', format: 'uuid' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary', description: 'One PNG/JPEG/GIF/WebP image or UTF-8 TXT/LOG/JSON/CRASH log; max 5 MiB.' } } } })
  @ApiCreatedResponse({ type: ResourceV2ReportAttachmentDto, description: 'Private attachment metadata and an authenticated download route; no storage path is returned.' })
  @ApiBadRequestResponse({ description: 'Unsupported file type/signature, invalid UTF-8 log, or attachment count/size limit reached.' })
  @ApiResponse({ status: 413, description: 'Multipart file exceeds the 5 MiB per-file limit.' })
  @ApiForbiddenResponse({ description: 'Report owner or phone verification is required.' })
  @ApiNotFoundResponse({ description: 'The report does not exist or the current user cannot modify it.' })
  async uploadIssue(@Param('reportId') reportId: string, @UploadedFile() file: Express.Multer.File | undefined, @Req() req: any) {
    try { return await this.attachments.add('issue', reportId, Number(req.user.id), file); }
    finally { await cleanupUploadedFile(file); }
  }

  @Get('issue-reports/:reportId/attachments')
  @OAuthProtected('resource.read')
  @RateLimit({ max: 60, window: 60 })
  @ApiOperation({ operationId: 'listModIssueReportAttachmentsV2', summary: '读取有权限访问的问题报告附件清单' })
  @ApiParam({ name: 'reportId', format: 'uuid' })
  @ApiOkResponse({ type: ResourceV2ReportAttachmentListDto, description: 'Private metadata only; rows contain public UUIDs and no numeric IDs or storage keys.' })
  @ApiBadRequestResponse({ description: 'The report identifier is not a UUID.' })
  @ApiNotFoundResponse({ description: 'The report does not exist or the current user cannot view its attachments.' })
  listIssue(@Param('reportId') reportId: string, @Req() req: any) {
    return this.attachments.list('issue', reportId, Number(req.user.id));
  }

  @Get('issue-reports/:reportId/attachments/:attachmentId')
  @OAuthProtected('resource.read')
  @RateLimit({ max: 30, window: 60 })
  @RawHttpResponse()
  @ApiOperation({ operationId: 'getModIssueReportAttachmentV2', summary: '下载有权限访问的问题报告附件' })
  @ApiParam({ name: 'reportId', format: 'uuid' })
  @ApiParam({ name: 'attachmentId', format: 'uuid' })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ description: 'Private binary download with Content-Disposition: attachment and no-store caching.', schema: { type: 'string', format: 'binary' } })
  @ApiBadRequestResponse({ description: 'A report or attachment identifier is not a UUID.' })
  @ApiNotFoundResponse({ description: 'The report or attachment does not exist or is not visible to the current user.' })
  async getIssue(@Param('reportId') reportId: string, @Param('attachmentId') attachmentId: string, @Req() req: any, @Res({ passthrough: true }) response: Response) {
    const file = await this.attachments.read('issue', reportId, attachmentId, Number(req.user.id));
    this.setDownloadHeaders(response, file);
    return new StreamableFile(file.buffer, { type: file.mime_type, disposition: file.content_disposition, length: file.size_bytes });
  }

  @Delete('issue-reports/:reportId/attachments/:attachmentId')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({ operationId: 'deleteModIssueReportAttachmentV2', summary: '删除本人问题报告的附件' })
  @ApiParam({ name: 'reportId', format: 'uuid' })
  @ApiParam({ name: 'attachmentId', format: 'uuid' })
  @ApiOkResponse({ type: ResourceV2ReportAttachmentDeleteDto, description: 'The report author deleted the private attachment.' })
  @ApiBadRequestResponse({ description: 'A report or attachment identifier is not a UUID.' })
  @ApiNotFoundResponse({ description: 'The report or attachment does not exist or is not owned by the current user.' })
  deleteIssue(@Param('reportId') reportId: string, @Param('attachmentId') attachmentId: string, @Req() req: any) {
    return this.attachments.remove('issue', reportId, attachmentId, Number(req.user.id));
  }

  @Post('compatibility-reports/:reportId/attachments')
  @OAuthProtected('resource.upload')
  @UseInterceptors(modReportAttachmentUploadInterceptor)
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({ operationId: 'uploadModCompatibilityReportAttachmentV2', summary: '为本人 Mod 兼容报告上传私有日志或图片证据', description: '手机号验证后的报告提交者可上传；附件保持在私有隔离存储，只能由报告提交者、相关 Owner/Maintainer/Publisher 或审核人员读取。请先清除 IP、令牌、用户名、本机路径和其他隐私信息。' })
  @ApiParam({ name: 'reportId', format: 'uuid' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary', description: 'One PNG/JPEG/GIF/WebP image or UTF-8 TXT/LOG/JSON/CRASH log; max 5 MiB.' } } } })
  @ApiCreatedResponse({ type: ResourceV2ReportAttachmentDto, description: 'Private attachment metadata and an authenticated download route; no storage path is returned.' })
  @ApiBadRequestResponse({ description: 'Unsupported file type/signature, invalid UTF-8 log, or attachment count/size limit reached.' })
  @ApiResponse({ status: 413, description: 'Multipart file exceeds the 5 MiB per-file limit.' })
  @ApiForbiddenResponse({ description: 'Report owner or phone verification is required.' })
  @ApiNotFoundResponse({ description: 'The report does not exist or the current user cannot modify it.' })
  async uploadCompatibility(@Param('reportId') reportId: string, @UploadedFile() file: Express.Multer.File | undefined, @Req() req: any) {
    try { return await this.attachments.add('compatibility', reportId, Number(req.user.id), file); }
    finally { await cleanupUploadedFile(file); }
  }

  @Get('compatibility-reports/:reportId/attachments')
  @OAuthProtected('resource.read')
  @RateLimit({ max: 60, window: 60 })
  @ApiOperation({ operationId: 'listModCompatibilityReportAttachmentsV2', summary: '读取有权限访问的兼容报告附件清单' })
  @ApiParam({ name: 'reportId', format: 'uuid' })
  @ApiOkResponse({ type: ResourceV2ReportAttachmentListDto, description: 'Private metadata only; rows contain public UUIDs and no numeric IDs or storage keys.' })
  @ApiBadRequestResponse({ description: 'The report identifier is not a UUID.' })
  @ApiNotFoundResponse({ description: 'The report does not exist or the current user cannot view its attachments.' })
  listCompatibility(@Param('reportId') reportId: string, @Req() req: any) {
    return this.attachments.list('compatibility', reportId, Number(req.user.id));
  }

  @Get('compatibility-reports/:reportId/attachments/:attachmentId')
  @OAuthProtected('resource.read')
  @RateLimit({ max: 30, window: 60 })
  @RawHttpResponse()
  @ApiOperation({ operationId: 'getModCompatibilityReportAttachmentV2', summary: '下载有权限访问的兼容报告附件' })
  @ApiParam({ name: 'reportId', format: 'uuid' })
  @ApiParam({ name: 'attachmentId', format: 'uuid' })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ description: 'Private binary download with Content-Disposition: attachment and no-store caching.', schema: { type: 'string', format: 'binary' } })
  @ApiBadRequestResponse({ description: 'A report or attachment identifier is not a UUID.' })
  @ApiNotFoundResponse({ description: 'The report or attachment does not exist or is not visible to the current user.' })
  async getCompatibility(@Param('reportId') reportId: string, @Param('attachmentId') attachmentId: string, @Req() req: any, @Res({ passthrough: true }) response: Response) {
    const file = await this.attachments.read('compatibility', reportId, attachmentId, Number(req.user.id));
    this.setDownloadHeaders(response, file);
    return new StreamableFile(file.buffer, { type: file.mime_type, disposition: file.content_disposition, length: file.size_bytes });
  }

  @Delete('compatibility-reports/:reportId/attachments/:attachmentId')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({ operationId: 'deleteModCompatibilityReportAttachmentV2', summary: '删除本人兼容报告的附件' })
  @ApiParam({ name: 'reportId', format: 'uuid' })
  @ApiParam({ name: 'attachmentId', format: 'uuid' })
  @ApiOkResponse({ type: ResourceV2ReportAttachmentDeleteDto, description: 'The report author deleted the private attachment.' })
  @ApiBadRequestResponse({ description: 'A report or attachment identifier is not a UUID.' })
  @ApiNotFoundResponse({ description: 'The report or attachment does not exist or is not owned by the current user.' })
  deleteCompatibility(@Param('reportId') reportId: string, @Param('attachmentId') attachmentId: string, @Req() req: any) {
    return this.attachments.remove('compatibility', reportId, attachmentId, Number(req.user.id));
  }

  private setDownloadHeaders(response: Response, file: { mime_type: string; size_bytes: number; content_disposition: string }) {
    response.setHeader('Content-Type', file.mime_type === 'text/plain' ? 'text/plain; charset=utf-8' : file.mime_type);
    response.setHeader('Content-Length', String(file.size_bytes));
    response.setHeader('Content-Disposition', file.content_disposition);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
  }
}
