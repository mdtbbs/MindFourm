import {
  BadRequestException, Body, Controller, Get, Header, HttpStatus, Param, Post, Delete, Logger,
  Query, Req, Res, UploadedFile, UseGuards, UseInterceptors, StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { createReadStream, mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { extname, resolve } from 'path';
import { Response } from 'express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { createHash } from 'crypto';
import { ApiV1, RawHttpResponse } from '@common/decorators/api-v1.decorator';
import { OptionalAuth } from '@common/decorators/public.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { SkipPhoneVerification } from '@common/decorators/skip-phone-verification.decorator';
import { assertSafeUploadedFile } from '@common/utils/upload-safety.util';
import { getClientIp } from '@common/utils/client-context.util';
import { GameContentAuthGuard, GameContentRequiredAuthGuard } from './game-content-auth.guard';
import { OAuthScopeDocumentation, OAuthScopeIfBearer } from '@common/decorators/oauth-protected.decorator';
import { GameContentService, GameResourceType } from './game-content.service';
import { CreateBlueprintDto, CompleteMapUploadDto, GameContentBlueprintCodeDto, GameContentBlueprintDetailDto, GameContentFeedResponseDto, GameContentListQueryDto, GameContentListResponseDto, GameContentMapDetailDto, GameContentMapUploadCreatedDto, GameContentUploadStatusDto } from './dto/game-content.dto';
import { ResourceStorageService } from '../resources/resource-storage.service';
import { GameContentCacheInterceptor } from './game-content-cache.interceptor';
import { attachmentContentDisposition } from '@common/utils/content-disposition.util';
import { SiteConfigService } from '@config/site-profile';

const MAP_INCOMING_DIR = resolve(process.env.RESOURCE_UPLOAD_ROOT || './uploads', '.quarantine/resources/.incoming');
// Keep uploads within the current renderer's 20 MiB synchronous-input bound.
const HARD_MAX_MAP_BYTES = 20 * 1024 * 1024;
function maxMapBytes(): number {
  const configured = Number(process.env.GAME_CONTENT_MAP_MAX_BYTES);
  return Number.isSafeInteger(configured) && configured > 0 ? Math.min(configured, HARD_MAX_MAP_BYTES) : HARD_MAX_MAP_BYTES;
}
const mapFileInterceptor = FileInterceptor('file', {
  storage: diskStorage({
    destination: (_req, _file, done) => { mkdirSync(MAP_INCOMING_DIR, { recursive: true }); done(null, MAP_INCOMING_DIR); },
    filename: (_req, file, done) => done(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: maxMapBytes(), files: 1, fields: 8, fieldSize: 64 * 1024 },
  fileFilter: (_req, file, done) => {
    if (extname(file.originalname).toLowerCase() !== '.msav') return done(new BadRequestException('地图仅支持 .msav 文件'), false);
    done(null, true);
  },
});

@ApiV1()
@ApiTags('v1-game-content')
@Controller('v1/game-content')
@UseGuards(GameContentAuthGuard)
@UseInterceptors(GameContentCacheInterceptor)
export class GameContentController {
  private readonly logger = new Logger(GameContentController.name);
  constructor(private readonly gameContent: GameContentService, private readonly storage: ResourceStorageService, private readonly siteConfig?: SiteConfigService) {}

  @Get('meta')
  @Header('Cache-Control', 'public, max-age=300')
  meta() {
    const rendererAvailable = Boolean(process.env.RESOURCE_RENDERER_URL);
    return { apiVersion: '1', service: 'MDTBBS Game Content', supportedTypes: ['blueprint', 'map'], features: { blueprints: true, maps: true, authentication: true, favorites: true, likes: true, blueprintUpload: rendererAvailable, mapUpload: rendererAvailable, blueprintProductionAnalysis: rendererAvailable }, limits: { defaultPageSize: 20, maxPageSize: 50, maxBlueprintBytes: this.blueprintMaxBytes(), maxMapBytes: maxMapBytes() } };
  }

  @Get('blueprints') @OptionalAuth() @OAuthScopeIfBearer('resource.read') @RateLimit({ max: 120, window: 60 }) @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120')
  @ApiQuery({ name: 'q', required: false, type: String, schema: { maxLength: 255 }, example: 'solar array', description: '按标题、说明和内容搜索。' })
  @ApiQuery({ name: 'sort', required: false, enum: ['latest', 'trending', 'featured', 'all'], example: 'latest', description: '列表排序或内容筛选方式。' })
  @ApiQuery({ name: 'order', required: false, enum: ['ASC', 'DESC', 'asc', 'desc'], example: 'DESC', description: '按排序字段升序或降序。' })
  @ApiQuery({ name: 'tags', required: false, type: String, example: 'power,solar', description: '以逗号分隔的标签筛选。' })
  @ApiQuery({ name: 'gameVersion', required: false, type: String, schema: { maxLength: 80 }, example: 'v157', description: '按 Mindustry 游戏版本筛选。' })
  @ApiQuery({ name: 'author', required: false, type: String, schema: { maxLength: 100 }, example: 'player_name', description: '按作者用户名筛选。' })
  @ApiQuery({ name: 'cursor', required: false, type: String, schema: { maxLength: 512 }, example: 'CURSOR_FROM_PREVIOUS_PAGE', description: '上一页 pagination.nextCursor 返回的不透明游标。' })
  @ApiQuery({ name: 'limit', required: false, type: Number, schema: { minimum: 1, maximum: 50 }, example: 20, description: '每页数量，默认 20，最大 50。' })
  @ApiOkResponse({ type: GameContentListResponseDto })
  listBlueprints(@Query() query: GameContentListQueryDto) { return this.gameContent.list('blueprint', query); }

  @Get('maps') @OptionalAuth() @OAuthScopeIfBearer('resource.read') @RateLimit({ max: 120, window: 60 }) @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120')
  @ApiQuery({ name: 'q', required: false, type: String, schema: { maxLength: 255 }, example: 'Salt Flats', description: '按标题、说明和内容搜索。' })
  @ApiQuery({ name: 'sort', required: false, enum: ['latest', 'trending', 'featured', 'all'], example: 'latest', description: '列表排序或内容筛选方式。' })
  @ApiQuery({ name: 'order', required: false, enum: ['ASC', 'DESC', 'asc', 'desc'], example: 'DESC', description: '按排序字段升序或降序。' })
  @ApiQuery({ name: 'tags', required: false, type: String, example: 'survival,desert', description: '以逗号分隔的标签筛选。' })
  @ApiQuery({ name: 'gameVersion', required: false, type: String, schema: { maxLength: 80 }, example: 'v157', description: '按 Mindustry 游戏版本筛选。' })
  @ApiQuery({ name: 'author', required: false, type: String, schema: { maxLength: 100 }, example: 'player_name', description: '按作者用户名筛选。' })
  @ApiQuery({ name: 'cursor', required: false, type: String, schema: { maxLength: 512 }, example: 'CURSOR_FROM_PREVIOUS_PAGE', description: '上一页 pagination.nextCursor 返回的不透明游标。' })
  @ApiQuery({ name: 'limit', required: false, type: Number, schema: { minimum: 1, maximum: 50 }, example: 20, description: '每页数量，默认 20，最大 50。' })
  @ApiOkResponse({ type: GameContentListResponseDto })
  listMaps(@Query() query: GameContentListQueryDto) { return this.gameContent.list('map', query); }

  @Get('blueprints/:id') @OptionalAuth() @OAuthScopeIfBearer('resource.read') @RateLimit({ max: 120, window: 60 }) @Header('Cache-Control', 'public, max-age=120, stale-while-revalidate=300')
  @ApiParam({ name: 'id', type: 'string' })
  @ApiOkResponse({ type: GameContentBlueprintDetailDto })
  blueprintDetail(@Param('id') id: string, @Req() req: any) { return this.gameContent.detail('blueprint', id, req.user || null, getClientIp(req)); }

  @Get('maps/:id') @OptionalAuth() @OAuthScopeIfBearer('resource.read') @RateLimit({ max: 120, window: 60 }) @Header('Cache-Control', 'public, max-age=120, stale-while-revalidate=300')
  @ApiParam({ name: 'id', type: 'string' })
  @ApiOkResponse({ type: GameContentMapDetailDto })
  mapDetail(@Param('id') id: string, @Req() req: any) { return this.gameContent.detail('map', id, req.user || null, getClientIp(req)); }

  @Get('blueprints/:id/code') @OptionalAuth() @OAuthScopeIfBearer('resource.read') @RateLimit({ max: 60, window: 60 }) @Header('Cache-Control', 'public, max-age=3600, immutable')
  @ApiOkResponse({ type: GameContentBlueprintCodeDto })
  blueprintCode(@Param('id') id: string, @Req() req: any) { return this.gameContent.blueprintCode(id, req.user || null); }

  @Get('maps/:id/download') @OptionalAuth() @OAuthScopeIfBearer('resource.download')
  @RateLimit({ max: 60, window: 60 })
  mapDownload(@Param('id') id: string, @Req() req: any) { return this.gameContent.downloadInfo(id, req.user?.id || null); }

  @Get('maps/:id/download/file') @OptionalAuth() @OAuthScopeIfBearer('resource.download') @RawHttpResponse() @RateLimit({ max: 30, window: 60 })
  async mapDownloadFile(@Param('id') id: string, @Req() req: any, @Res({ passthrough: true }) res: Response) {
    const userAgent = typeof req.headers?.['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 80) : null;
    const platform = typeof req.headers?.['x-client-platform'] === 'string' ? req.headers['x-client-platform'].slice(0, 40) : null;
    const context = { userId: req.user?.id || null, clientType: 'game-content', platform, clientVersion: userAgent };
    let target: Awaited<ReturnType<GameContentService['prepareMapDownload']>>;
    try {
      target = await this.gameContent.prepareMapDownload(id, context.userId, context.clientType, getClientIp(req), context.clientVersion, platform);
    } catch (error) {
      await this.gameContent.recordDownloadFailure(id, context.userId, context.clientType, platform, context.clientVersion)
        .catch((persistError) => this.logger.warn(`Download failed analytics persistence failed: ${(persistError as Error).message}`));
      throw error;
    }
    const logLifecycle = (event: 'started' | 'completed' | 'failed') => this.gameContent.recordDownloadLifecycle(target, event, context.userId, context.clientType, platform, context.clientVersion)
      .catch((error) => this.logger.warn(`Download ${event} analytics persistence failed: ${(error as Error).message}`));
    await logLifecycle('started');
    if (target.externalUrl) return res.redirect(target.externalUrl);
    if (!target.path) throw new BadRequestException({ code: 'RESOURCE_NOT_AVAILABLE', message: '地图文件暂不可用' });
    res.set({
      'Content-Type': target.file?.mime_type || target.version?.mime_type || target.resource.mime_type || 'application/octet-stream',
      'Content-Disposition': attachmentContentDisposition(target.file?.original_filename || target.version?.file_name || target.resource.file_name || 'map.msav'),
      'Content-Length': String(target.size),
      'Cache-Control': 'private, no-store',
    });
    const hash = target.file?.content_hash || target.version?.content_hash || target.resource.content_hash;
    if (hash) res.setHeader('ETag', `"${hash}"`);
    const stream = createReadStream(target.path);
    let lifecycleFinished = false;
    const finishLifecycle = (event: 'completed' | 'failed') => {
      if (lifecycleFinished) return;
      lifecycleFinished = true;
      void logLifecycle(event);
    };
    stream.once('error', () => finishLifecycle('failed'));
    res.once('finish', () => finishLifecycle(res.statusCode < 400 ? 'completed' : 'failed'));
    res.once('close', () => { if (!res.writableFinished) finishLifecycle('failed'); });
    return new StreamableFile(stream);
  }

  @Get('blueprints/:id/preview') @OptionalAuth() @OAuthScopeIfBearer('resource.read') @RawHttpResponse()
  async blueprintPreview(@Param('id') id: string, @Res() res: Response) { return this.sendPreview('blueprint', id, res); }

  @Get('maps/:id/preview') @OptionalAuth() @OAuthScopeIfBearer('resource.read') @RawHttpResponse()
  async mapPreview(@Param('id') id: string, @Res() res: Response) { return this.sendPreview('map', id, res); }

  private async sendPreview(type: GameResourceType, id: string, res: Response) {
    const image = await this.gameContent.preview(type, id);
    if (!image) throw new BadRequestException({ code: 'RESOURCE_NOT_AVAILABLE', message: '预览暂不可用' });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', `"${createHash('sha256').update(image).digest('hex')}"`);
    return res.send(image);
  }

  @Get('feed') @OptionalAuth() @OAuthScopeIfBearer('resource.read') @RateLimit({ max: 120, window: 60 }) @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120')
  @ApiQuery({ name: 'type', required: false, enum: ['featured', 'latest', 'trending', 'all'], example: 'all', description: '返回精选、最新、热门或全部内容分区。' })
  @ApiQuery({ name: 'limit', required: false, type: Number, schema: { minimum: 1, maximum: 50 }, example: 20, description: '每个 Feed 分区最多返回数量，默认 20。' })
  @ApiOkResponse({ type: GameContentFeedResponseDto })
  async feed(@Query('type') type = 'all', @Query('limit') limit = '20') {
    if (!['featured', 'latest', 'trending', 'all'].includes(type)) throw new BadRequestException('无效的 Feed 类型');
    const sections: Array<{ type: string; title: string; items: unknown[] }> = [];
    if (type === 'featured' || type === 'all') {
      const [featuredBlueprints, featuredMaps] = await Promise.all([
        this.gameContent.list('blueprint', { sort: 'latest', limit, featuredOnly: true }),
        this.gameContent.list('map', { sort: 'latest', limit, featuredOnly: true }),
      ]);
      const featuredItems = [...featuredBlueprints.data, ...featuredMaps.data]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, Math.max(1, Math.min(50, Number.parseInt(limit, 10) || 20)));
      sections.push({ type: 'featured', title: '精选内容', items: featuredItems });
    }
    if (type === 'latest' || type === 'all') {
      const [blueprints, maps] = await Promise.all([
        this.gameContent.list('blueprint', { sort: 'latest', limit }),
        this.gameContent.list('map', { sort: 'latest', limit }),
      ]);
      sections.push({ type: 'latest', title: '最新蓝图', items: blueprints.data });
      sections.push({ type: 'latest', title: '最新地图', items: maps.data });
    }
    if (type === 'trending' || type === 'all') {
      const [blueprints, maps] = await Promise.all([
        this.gameContent.list('blueprint', { sort: 'trending', limit }),
        this.gameContent.list('map', { sort: 'trending', limit }),
      ]);
      sections.push({ type: 'trending', title: '热门蓝图', items: blueprints.data });
      sections.push({ type: 'trending', title: '热门地图', items: maps.data });
    }
    return { sections };
  }

  @Get('search') @OptionalAuth() @OAuthScopeIfBearer('resource.read') @RateLimit({ max: 60, window: 60 }) @Header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
  @ApiQuery({ name: 'q', required: true, type: String, schema: { maxLength: 255 }, example: 'power', description: '必填搜索关键词。' })
  @ApiQuery({ name: 'type', required: false, enum: ['all', 'blueprint', 'map'], example: 'all', description: '搜索全部内容、蓝图或地图。' })
  @ApiQuery({ name: 'sort', required: false, enum: ['latest', 'trending', 'featured', 'all'], example: 'latest', description: '列表排序或内容筛选方式。' })
  @ApiQuery({ name: 'order', required: false, enum: ['ASC', 'DESC', 'asc', 'desc'], example: 'DESC', description: '按排序字段升序或降序。' })
  @ApiQuery({ name: 'tags', required: false, type: String, example: 'power,solar', description: '以逗号分隔的标签筛选。' })
  @ApiQuery({ name: 'gameVersion', required: false, type: String, schema: { maxLength: 80 }, example: 'v157', description: '按 Mindustry 游戏版本筛选。' })
  @ApiQuery({ name: 'author', required: false, type: String, schema: { maxLength: 100 }, example: 'player_name', description: '按作者用户名筛选。' })
  @ApiQuery({ name: 'cursor', required: false, type: String, schema: { maxLength: 512 }, example: 'CURSOR_FROM_PREVIOUS_PAGE', description: '上一页 pagination.nextCursor 返回的不透明游标。' })
  @ApiQuery({ name: 'limit', required: false, type: Number, schema: { minimum: 1, maximum: 50 }, example: 20, description: '每页数量，默认 20，最大 50。' })
  @ApiOkResponse({ type: GameContentListResponseDto })
  async search(@Query() query: GameContentListQueryDto, @Query('type') type = 'all') {
    if (!query.q?.trim()) throw new BadRequestException({ code: 'SEARCH_QUERY_REQUIRED', message: '请输入搜索关键词' });
    if (!['all', 'blueprint', 'map'].includes(type)) throw new BadRequestException('无效的资源类型');
    if (type !== 'all') {
      const result = await this.gameContent.list(type as GameResourceType, query);
      return { data: result.data, pagination: result.pagination };
    }
    let cursors: Record<string, string | 'done' | undefined> = {};
    if (query.cursor) {
      try { cursors = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')); }
      catch { throw new BadRequestException({ code: 'INVALID_CURSOR', message: '分页游标无效' }); }
      if (!cursors || typeof cursors !== 'object' || Array.isArray(cursors)) throw new BadRequestException({ code: 'INVALID_CURSOR', message: '分页游标无效' });
      if (Object.values(cursors).some((cursor) => cursor !== undefined && cursor !== 'done' && typeof cursor !== 'string')) throw new BadRequestException({ code: 'INVALID_CURSOR', message: '分页游标无效' });
    }
    const kinds: GameResourceType[] = ['blueprint', 'map'];
    const results = await Promise.all(kinds.map((kind) => cursors[kind] === 'done'
      ? Promise.resolve({ data: [], pagination: { hasMore: false, nextCursor: null } })
      : this.gameContent.list(kind, { ...query, sort: 'latest', order: 'DESC', cursor: cursors[kind] })));
    const data = results.flatMap((result) => result.data).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const hasMore = results.some((result) => result.pagination.hasMore);
    const nextCursor = hasMore ? Buffer.from(JSON.stringify({
      blueprint: results[0].pagination.hasMore ? results[0].pagination.nextCursor : 'done',
      map: results[1].pagination.hasMore ? results[1].pagination.nextCursor : 'done',
    })).toString('base64url') : null;
    return { data, pagination: { hasMore, nextCursor } };
  }

  @Get('tags') @OptionalAuth() @OAuthScopeIfBearer('resource.read') @RateLimit({ max: 60, window: 60 }) @Header('Cache-Control', 'public, max-age=300')
  tags() { return this.gameContent.tags(); }

  @Post('blueprints') @SkipPhoneVerification() @UseGuards(GameContentRequiredAuthGuard) @RateLimit({ max: 5, window: 3600 })
  @OAuthScopeDocumentation('resource.upload')
  @ApiBearerAuth('MindAuthBearer')
  @ApiOperation({ summary: 'Submit a blueprint through the existing resource moderation flow' })
  async createBlueprint(@Body() body: CreateBlueprintDto, @Req() req: any) {
    this.assertPhoneVerified(req.user);
    const draft = await this.gameContent.beginBlueprintUpload(req.user.id, body.code);
    return this.gameContent.completeUpload(req.user.id, 'blueprint', draft.id, body, getClientIp(req));
  }

  @Post('maps/uploads') @SkipPhoneVerification() @UseGuards(GameContentRequiredAuthGuard) @UseInterceptors(mapFileInterceptor) @RateLimit({ max: 3, window: 3600 })
  @OAuthScopeDocumentation('resource.upload')
  @ApiBearerAuth('MindAuthBearer')
  @ApiOkResponse({ type: GameContentMapUploadCreatedDto })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file', 'sha256'], properties: { file: { type: 'string', format: 'binary' }, sha256: { type: 'string', pattern: '^[a-fA-F0-9]{64}$' } } } })
  async beginMapUpload(@UploadedFile() file: Express.Multer.File, @Body('sha256') expectedHash: string, @Req() req: any) {
    this.assertPhoneVerified(req.user);
    if (!file) throw new BadRequestException({ code: 'INVALID_MAP', message: '请上传 .msav 地图文件' });
    const limit = maxMapBytes();
    try {
      await assertSafeUploadedFile(file, limit);
      if (!/^[a-f0-9]{64}$/i.test(expectedHash || '')) throw new BadRequestException({ code: 'HASH_MISMATCH', message: '必须提供文件 SHA256' });
      const stored = await this.storage.storeIncoming(file);
      if (!stored) throw new BadRequestException({ code: 'INVALID_MAP', message: '地图文件暂存失败' });
      const upload = await this.gameContent.beginMapUpload(req.user.id, stored, expectedHash);
      return { uploadId: upload.id, status: 'ready_for_completion', expiresAt: upload.expires_at, preview: upload.preview_url };
    } catch (error) {
      if (file.path) await unlink(file.path).catch(() => undefined);
      throw error;
    }
  }

  @Post('maps/uploads/:uploadId/complete') @SkipPhoneVerification() @UseGuards(GameContentRequiredAuthGuard) @RateLimit({ max: 5, window: 3600 })
  @OAuthScopeDocumentation('resource.upload')
  @ApiBearerAuth('MindAuthBearer')
  completeMapUpload(@Param('uploadId') uploadId: string, @Body() body: CompleteMapUploadDto, @Req() req: any) {
    this.assertPhoneVerified(req.user);
    return this.gameContent.completeUpload(req.user.id, 'map', uploadId, body, getClientIp(req));
  }

  @Get('maps/uploads/:uploadId') @UseGuards(GameContentRequiredAuthGuard) @OAuthScopeDocumentation('resource.upload') @ApiBearerAuth('MindAuthBearer') @ApiOkResponse({ type: GameContentUploadStatusDto })
  uploadSession(@Param('uploadId') uploadId: string, @Req() req: any) {
    return this.gameContent.uploadSessionStatus(req.user.id, uploadId);
  }

  @Get('maps/uploads/:uploadId/preview') @UseGuards(GameContentRequiredAuthGuard) @OAuthScopeDocumentation('resource.upload') @RawHttpResponse() @ApiBearerAuth('MindAuthBearer')
  async uploadSessionPreview(@Param('uploadId') uploadId: string, @Req() req: any, @Res() res: Response) {
    const image = await this.gameContent.uploadSessionPreview(req.user.id, uploadId);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(image);
  }

  private assertPhoneVerified(user: any) {
    if (this.siteConfig?.current.verification.requireEmail !== false && !user?.email_verified) {
      throw new BadRequestException({ code: 'EMAIL_VERIFICATION_REQUIRED', message: 'Verify your email address before continuing.' });
    }
    if (this.siteConfig?.current.verification.requirePhoneForWrites !== false && !user?.phone_verified) {
      throw new BadRequestException({ code: 'PHONE_VERIFICATION_REQUIRED', message: 'Verify your phone number before continuing.' });
    }
  }

  @Post('blueprints/:id/like') @SkipPhoneVerification() @UseGuards(GameContentRequiredAuthGuard) @RateLimit({ max: 60, window: 60 })
  @OAuthScopeDocumentation('forum.write')
  @ApiBearerAuth('MindAuthBearer')
  likeBlueprint(@Param('id') id: string, @Req() req: any) { this.assertPhoneVerified(req.user); return this.gameContent.toggleLike('blueprint', id, req.user.id, true); }
  @Delete('blueprints/:id/like') @SkipPhoneVerification() @UseGuards(GameContentRequiredAuthGuard) @RateLimit({ max: 60, window: 60 })
  @OAuthScopeDocumentation('forum.write')
  @ApiBearerAuth('MindAuthBearer')
  unlikeBlueprint(@Param('id') id: string, @Req() req: any) { this.assertPhoneVerified(req.user); return this.gameContent.toggleLike('blueprint', id, req.user.id, false); }
  @Post('maps/:id/like') @SkipPhoneVerification() @UseGuards(GameContentRequiredAuthGuard) @RateLimit({ max: 60, window: 60 })
  @OAuthScopeDocumentation('forum.write')
  @ApiBearerAuth('MindAuthBearer')
  likeMap(@Param('id') id: string, @Req() req: any) { this.assertPhoneVerified(req.user); return this.gameContent.toggleLike('map', id, req.user.id, true); }
  @Delete('maps/:id/like') @SkipPhoneVerification() @UseGuards(GameContentRequiredAuthGuard) @RateLimit({ max: 60, window: 60 })
  @OAuthScopeDocumentation('forum.write')
  @ApiBearerAuth('MindAuthBearer')
  unlikeMap(@Param('id') id: string, @Req() req: any) { this.assertPhoneVerified(req.user); return this.gameContent.toggleLike('map', id, req.user.id, false); }

  @Post(':type/:id/favorite') @SkipPhoneVerification() @UseGuards(GameContentRequiredAuthGuard) @RateLimit({ max: 60, window: 60 })
  @OAuthScopeDocumentation('forum.write')
  @ApiBearerAuth('MindAuthBearer')
  favorite(@Param('type') type: string, @Param('id') id: string, @Req() req: any) { this.assertPhoneVerified(req.user); return this.gameContent.toggleFavorite(this.parseType(type), id, req.user.id, true); }
  @Delete(':type/:id/favorite') @SkipPhoneVerification() @UseGuards(GameContentRequiredAuthGuard) @RateLimit({ max: 60, window: 60 })
  @OAuthScopeDocumentation('forum.write')
  @ApiBearerAuth('MindAuthBearer')
  unfavorite(@Param('type') type: string, @Param('id') id: string, @Req() req: any) { this.assertPhoneVerified(req.user); return this.gameContent.toggleFavorite(this.parseType(type), id, req.user.id, false); }
  private parseType(value: string): GameResourceType { if (value === 'blueprint' || value === 'map') return value; throw new BadRequestException('无效的资源类型'); }

  @Get('me') @UseGuards(GameContentRequiredAuthGuard) @OAuthScopeDocumentation('resource.read')
  @ApiBearerAuth('MindAuthBearer')
  me(@Req() req: any) { return this.gameContent.me(req.user); }
  @Get('me/favorites') @UseGuards(GameContentRequiredAuthGuard) @OAuthScopeDocumentation('resource.read')
  @ApiBearerAuth('MindAuthBearer')
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, description: '最多返回的收藏内容数量，默认 20。' })
  myFavorites(@Req() req: any, @Query('limit') limit?: string) { return this.gameContent.favoritesFor(req.user.id, Number(limit) || 20); }
  @Get('me/resources') @UseGuards(GameContentRequiredAuthGuard) @OAuthScopeDocumentation('resource.read')
  @ApiBearerAuth('MindAuthBearer')
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, description: '最多返回的本人投稿数量，默认 20。' })
  myResources(@Req() req: any, @Query('limit') limit?: string) { return this.gameContent.myResources(req.user.id, Number(limit) || 20); }

  private blueprintMaxBytes(): number {
    const configured = Number(process.env.GAME_CONTENT_BLUEPRINT_MAX_BYTES);
    return Number.isSafeInteger(configured) && configured > 0 ? Math.min(configured, 20 * 1024 * 1024) : 20 * 1024 * 1024;
  }
}
