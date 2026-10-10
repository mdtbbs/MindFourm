import {
  Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Put, Query, Req, Res, UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth, ApiConsumes, ApiHeader, ApiOperation, ApiParam, ApiProduces, ApiQuery, ApiResponse, ApiTags,
} from '@nestjs/swagger';
import { ApiV1, RawHttpResponse } from '@common/decorators/api-v1.decorator';
import { OAuthOptionalProtected, OAuthProtected } from '@common/decorators/oauth-protected.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { SkipPhoneVerification } from '@common/decorators/skip-phone-verification.decorator';
import { getClientIp } from '@common/utils/client-context.util';
import { INLINE_SAFE_BLOB_MIME_TYPES, MAX_OPEN_BLOB_UPLOADS } from './blobs.constants';
import { BlobsService, BlobActor } from './blobs.service';
import {
  BlobCommitResponseDto, BlobCreatedDto, BlobDeletedDto, BlobDto, BlobUsageDto,
  CreateBlobDto, ListBlobsQueryDto, UpdateBlobDto,
} from './dto/blob.dto';
import { BlobNoStoreInterceptor } from './blob-no-store.interceptor';

/**
 * Generic blob storage for any business feature.
 *
 * The write path is three calls — create a session, PUT the bytes, commit — and
 * each one is safe to repeat: creation and commit accept an `Idempotency-Key`,
 * and a session that already has its bytes answers a repeated PUT without
 * writing a second copy. Reads are authenticated; `private` blobs are only
 * visible to their owner, which is what makes them usable for staging data that
 * has not been published yet.
 */
@ApiV1()
@ApiTags('公共 V1 / Blob 存储')
@ApiBearerAuth('MindAuthBearer')
@SkipPhoneVerification()
@UseInterceptors(BlobNoStoreInterceptor)
@Controller('v1/blobs')
export class BlobsController {
  constructor(private readonly blobs: BlobsService) {}

  @Get('quota')
  @OAuthProtected('blob.read')
  @RateLimit({ max: 60, window: 60 })
  @ApiOperation({ summary: '查看 blob 空间用量', description: '返回当前所有者已用字节数、配额、单对象上限与有效 blob 数量；进行中的上传会预占额度。' })
  @ApiResponse({ status: 200, type: BlobUsageDto })
  quota(@Req() req: any) { return this.blobs.usage(BlobsService.userOwner(req.user.id)); }

  @Get()
  @OAuthProtected('blob.read')
  @RateLimit({ max: 120, window: 60 })
  @ApiQuery({ name: 'namespace', required: false, type: String, description: '按 namespace 过滤。' })
  @ApiQuery({ name: 'ref_type', required: false, type: String, description: '按业务引用类型过滤。' })
  @ApiQuery({ name: 'ref_id', required: false, type: String, description: '按业务引用 ID 过滤。' })
  @ApiQuery({ name: 'cursor', required: false, type: String, schema: { maxLength: 300 }, description: '上一页 meta.next_cursor 返回的不透明游标。' })
  @ApiQuery({ name: 'limit', required: false, type: Number, schema: { minimum: 1, maximum: 100 }, example: 30 })
  @ApiOperation({ summary: '列出我的 blob', description: '只返回当前所有者的有效 blob；下一页游标位于 meta.next_cursor。' })
  list(@Req() req: any, @Query() query: ListBlobsQueryDto) {
    return this.blobs.listBlobs(BlobsService.userOwner(req.user.id), query);
  }

  @Post()
  @OAuthProtected('blob.write')
  @RateLimit({ max: 60, window: 600 })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: '按所有者重放同一创建请求，保留 24 小时。' })
  @ApiOperation({
    summary: '创建 blob 上传',
    description: '登记目标 key 与内容指纹。若相同内容已存在则 deduplicated=true，无需再上传；否则返回 upload.url，PUT 成功后调用 commit。',
  })
  @ApiResponse({ status: 201, type: BlobCreatedDto })
  create(@Req() req: any, @Body() body: CreateBlobDto, @Headers('idempotency-key') key?: string) {
    return this.blobs.createUpload(BlobsService.userOwner(req.user.id), body, this.actor(req), key);
  }

  @Put('uploads/:uploadId/content')
  @RawHttpResponse()
  @OAuthProtected('blob.write')
  @RateLimit({ max: 120, window: 600 })
  @ApiConsumes('application/octet-stream')
  @ApiProduces('application/json')
  @ApiParam({ name: 'uploadId', description: '上传会话 UUID' })
  @ApiHeader({ name: 'Content-Type', required: false, description: '必须是 application/octet-stream。' })
  @ApiOperation({ summary: '上传 blob 内容', description: '将原始字节 PUT 到该地址。服务端会校验声明的大小与 SHA-256，任何不一致都会拒绝并丢弃数据。' })
  async upload(
    @Req() req: any,
    @Res() res: any,
    @Param('uploadId') uploadId: string,
    @Headers('content-type') contentType?: string,
  ) {
    // A JSON or form-encoded body would be transformed by the global body parser
    // before this method runs, which silently corrupts the bytes the digest is
    // computed over. Only the raw stream is accepted.
    const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
    if (mime && mime !== 'application/octet-stream') {
      res.status(415).json({
        error: { code: 'BLOB_METADATA_INVALID', message: '上传内容必须使用 application/octet-stream。', retryable: false, details: [] },
      });
      return;
    }
    const receipt = await this.blobs.receiveUpload(
      BlobsService.userOwner(req.user.id), uploadId, req, this.actor(req),
    );
    res.status(200).json({ data: receipt, meta: this.meta(req) });
  }

  @Post('uploads/:uploadId/commit')
  @HttpCode(200)
  @OAuthProtected('blob.write')
  @RateLimit({ max: 60, window: 600 })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: '按所有者重放同一提交请求，保留 24 小时。' })
  @ApiParam({ name: 'uploadId', description: '上传会话 UUID' })
  @ApiOperation({ summary: '提交 blob', description: '服务端复核存储对象的大小与 SHA-256 后创建可读写 blob；同 key 的旧 blob 会被替换并进入延迟回收。' })
  @ApiResponse({ status: 200, type: BlobCommitResponseDto })
  commit(@Req() req: any, @Param('uploadId') uploadId: string, @Headers('idempotency-key') key?: string) {
    return this.blobs.commitUpload(BlobsService.userOwner(req.user.id), uploadId, this.actor(req), key);
  }

  @Delete('uploads/:uploadId')
  @OAuthProtected('blob.write')
  @RateLimit({ max: 60, window: 600 })
  @ApiParam({ name: 'uploadId', description: '上传会话 UUID' })
  @ApiOperation({ summary: '取消上传', description: '放弃上传会话；已写入的临时对象由维护任务清理。' })
  cancel(@Req() req: any, @Param('uploadId') uploadId: string) {
    return this.blobs.cancelUpload(BlobsService.userOwner(req.user.id), uploadId, this.actor(req));
  }

  @Get(':blobId')
  @OAuthOptionalProtected('blob.read')
  @RateLimit({ max: 300, window: 60 })
  @ApiParam({ name: 'blobId', description: 'blob UUID' })
  @ApiOperation({ summary: '查看 blob 详情', description: '无需登录即可读取 public blob；私有 blob 仅所有者可见，不可见时与不存在返回相同的 404。' })
  @ApiResponse({ status: 200, type: BlobDto })
  get(@Req() req: any, @Param('blobId') blobId: string) {
    return this.blobs.getBlob(this.viewer(req), blobId);
  }

  @Get(':blobId/content')
  @OAuthOptionalProtected('blob.read')
  @RateLimit({ max: 300, window: 60 })
  @ApiProduces('application/octet-stream')
  @ApiParam({ name: 'blobId', description: 'blob UUID' })
  @ApiOperation({ summary: '下载 blob 内容', description: 'public blob 无需登录即可下载，私有 blob 需所有者身份。只有白名单内的媒体类型会内联渲染，其余一律以附件下载，避免上传者声明的类型变成可执行内容。' })
  async content(@Req() req: any, @Res() res: any, @Param('blobId') blobId: string) {
    const file = await this.blobs.openBlobContent(this.viewer(req), blobId);
    const name = String(file.row.file_name || 'blob');
    const safeName = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    res.status(200);
    res.setHeader('Content-Type', this.responseMime(String(file.row.mime_type)));
    res.setHeader('Content-Length', String(file.size));
    res.setHeader('Content-Disposition',
      `${this.isInlineSafe(String(file.row.mime_type)) ? 'inline' : 'attachment'}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    // Private blobs must not sit in shared caches, and the digest is a safe
    // validator because content is immutable per object.
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('ETag', `"sha256-${file.row.sha256}"`);
    res.setHeader('Last-Modified', file.last_modified.toUTCString());
    file.stream.on('error', () => {
      if (res.headersSent) res.destroy();
      else res.status(500).end();
    });
    file.stream.pipe(res);
  }

  @Patch(':blobId')
  @OAuthProtected('blob.write')
  @RateLimit({ max: 120, window: 60 })
  @ApiParam({ name: 'blobId', description: 'blob UUID' })
  @ApiOperation({ summary: '更新 blob 元数据', description: '修改 key、文件名、可见性、元数据、标签与业务引用；内容本身不可变。' })
  @ApiResponse({ status: 200, type: BlobDto })
  update(@Req() req: any, @Param('blobId') blobId: string, @Body() body: UpdateBlobDto) {
    return this.blobs.updateBlob(BlobsService.userOwner(req.user.id), blobId, body, this.actor(req));
  }

  @Delete(':blobId')
  @OAuthProtected('blob.delete')
  @RateLimit({ max: 60, window: 60 })
  @ApiParam({ name: 'blobId', description: 'blob UUID' })
  @ApiOperation({ summary: '删除 blob', description: '软删除绑定；对象在引用数归零并经过宽限期后被回收。重复删除返回 404。' })
  @ApiResponse({ status: 200, type: BlobDeletedDto })
  remove(@Req() req: any, @Param('blobId') blobId: string) {
    return this.blobs.deleteBlob(BlobsService.userOwner(req.user.id), blobId, this.actor(req));
  }

  /** Anonymous callers pass no viewer, so they only ever reach public blobs. */
  private viewer(req: any): ReturnType<typeof BlobsService.userOwner> | null {
    return req.user?.id ? BlobsService.userOwner(req.user.id) : null;
  }

  private isInlineSafe(mime: string): boolean {
    return INLINE_SAFE_BLOB_MIME_TYPES.includes(mime.toLowerCase());
  }

  private responseMime(mime: string): string {
    return this.isInlineSafe(mime) ? mime : 'application/octet-stream';
  }

  private actor(req: any, extra: Record<string, unknown> = {}): BlobActor & Record<string, unknown> {
    return {
      clientId: req.authContext?.clientId,
      requestId: req.requestId,
      ip: getClientIp(req),
      userAgent: req.headers?.['user-agent'],
      ...extra,
    };
  }

  private meta(req: any) {
    return { request_id: req.requestId ?? null, api_version: 'v1', open_upload_limit: MAX_OPEN_BLOB_UPLOADS };
  }
}
