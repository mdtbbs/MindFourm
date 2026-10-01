import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, Query, Req, Res, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiHeader, ApiOperation, ApiParam, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '@common/decorators/api-v1.decorator';
import { OAuthProtected } from '@common/decorators/oauth-protected.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { SkipPhoneVerification } from '@common/decorators/skip-phone-verification.decorator';
import { CloudSaveActor, GameSavesService } from './game-saves.service';
import { CreateGameSaveSlotDto, CreateGameSaveUploadDto, GameSaveListQueryDto, PatchGameSaveSlotDto, PatchGameSaveSnapshotDto, RestoreGameSaveDto } from './dto/game-saves.dto';
import { getClientIp } from '@common/utils/client-context.util';
import { CloudSaveNoStoreInterceptor } from './cloud-save-no-store.interceptor';

@ApiV1()
@ApiTags('游戏内容 / 云存档')
@ApiBearerAuth('MindAuthBearer')
@SkipPhoneVerification()
@UseInterceptors(CloudSaveNoStoreInterceptor)
@Controller('v1/game-saves')
export class GameSavesController {
  constructor(private readonly saves: GameSavesService) {}

  @Get('quota')
  @OAuthProtected('game_content.saves.read')
  @RateLimit({ max: 60, window: 60 })
  @ApiOperation({ summary: '查看云存档空间', description: '返回当前账号的唯一文件计费使用量、单文件限制、Slot 数量和历史保留策略。' })
  quota(@Req() req: any) { return this.saves.getQuota(req.user.id); }

  @Get()
  @OAuthProtected('game_content.saves.read')
  @RateLimit({ max: 120, window: 60 })
  @ApiQuery({ name: 'cursor', required: false, type: String, schema: { maxLength: 300 }, example: 'CURSOR_FROM_PREVIOUS_PAGE', description: '上一页 meta.next_cursor 返回的不透明游标。' })
  @ApiQuery({ name: 'limit', required: false, type: Number, schema: { minimum: 1, maximum: 100 }, example: 30, description: '每页云存档数量，默认 30。' })
  @ApiOperation({ summary: '列出我的云存档', description: '使用游标分页查看私有 Save Slot；下一页游标位于 meta.next_cursor。' })
  list(@Req() req: any, @Query() query: GameSaveListQueryDto) { return this.saves.listSlots(req.user.id, query.cursor, query.limit); }

  @Post()
  @OAuthProtected('game_content.saves.write')
  @RateLimit({ max: 10, window: 600 })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: '按账号重放相同创建请求，保留 24 小时。' })
  @ApiOperation({ summary: '创建云存档 Slot', description: '创建仅本人可见的逻辑存档容器。' })
  create(@Req() req: any, @Body() body: CreateGameSaveSlotDto, @Headers('idempotency-key') key?: string) {
    return this.saves.createSlot(req.user.id, body, this.actor(req), key);
  }

  @Get(':slotId')
  @OAuthProtected('game_content.saves.read')
  @RateLimit({ max: 120, window: 60 })
  @ApiParam({ name: 'slotId', description: 'Save Slot UUID' })
  @ApiOperation({ summary: '查看云存档详情', description: '仅返回当前账号拥有的 Slot 与当前快照元数据。' })
  get(@Req() req: any, @Param('slotId') slotId: string) { return this.saves.getSlot(req.user.id, slotId); }

  @Patch(':slotId')
  @OAuthProtected('game_content.saves.write')
  @RateLimit({ max: 30, window: 60 })
  @ApiOperation({ summary: '重命名云存档', description: '只修改 Slot 名称，不会修改任何历史 Snapshot。' })
  rename(@Req() req: any, @Param('slotId') slotId: string, @Body() body: PatchGameSaveSlotDto) {
    return this.saves.renameSlot(req.user.id, slotId, body, this.actor(req));
  }

  @Delete(':slotId')
  @OAuthProtected('game_content.saves.delete')
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({ summary: '删除云存档', description: '软删除 Slot 与其全部历史；对象进入延迟回收。本地存档不会受影响。' })
  delete(@Req() req: any, @Param('slotId') slotId: string) { return this.saves.deleteSlot(req.user.id, slotId, this.actor(req)); }

  @Get(':slotId/snapshots')
  @OAuthProtected('game_content.saves.read')
  @RateLimit({ max: 120, window: 60 })
  @ApiOperation({ summary: '查看快照历史', description: '按 revision 从新到旧返回不可变历史版本。' })
  snapshots(@Req() req: any, @Param('slotId') slotId: string) { return this.saves.listSnapshots(req.user.id, slotId); }

  @Post(':slotId/snapshots/:snapshotId/download')
  @OAuthProtected('game_content.saves.read')
  @RateLimit({ max: 30, window: 60 })
  @ApiOperation({ summary: '获取快照下载地址', description: '返回需继续携带当前论坛会话或 OAuth Bearer 的私有下载 API 地址。' })
  download(@Req() req: any, @Param('slotId') slotId: string, @Param('snapshotId') snapshotId: string) {
    return this.saves.downloadGrant(req.user.id, slotId, snapshotId, this.actor(req));
  }

  @Get(':slotId/snapshots/:snapshotId/file')
  @OAuthProtected('game_content.saves.read')
  @RateLimit({ max: 30, window: 300 })
  @ApiProduces('application/octet-stream')
  @ApiOperation({ summary: '下载快照文件', description: '通过当前 OAuth Bearer 直接从论坛本地持久化目录下载私有文件。' })
  async downloadFile(@Req() req: any, @Param('slotId') slotId: string, @Param('snapshotId') snapshotId: string, @Res() res: any) {
    const file = await this.saves.openSnapshotDownload(req.user.id, slotId, snapshotId, this.actor(req));
    const safeName = file.file_name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    res.status(200);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(file.size));
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.file_name)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    file.stream.on('error', () => {
      if (res.headersSent) res.destroy();
      else res.status(500).end();
    });
    file.stream.pipe(res);
  }

  @Post(':slotId/snapshots/:snapshotId/restore')
  @OAuthProtected('game_content.saves.write')
  @RateLimit({ max: 10, window: 60 })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: '按账号重放同一恢复操作，保留 24 小时。' })
  @ApiOperation({ summary: '恢复历史快照', description: '恢复会创建新的线性 revision，不会把 current 指针回拨到旧版本。提交 confirm_current_snapshot_id 可防止覆盖期间发生变化。' })
  restore(@Req() req: any, @Param('slotId') slotId: string, @Param('snapshotId') snapshotId: string,
    @Body() body: RestoreGameSaveDto, @Headers('idempotency-key') key?: string) {
    return this.saves.restore(req.user.id, slotId, snapshotId, body, this.actor(req), key);
  }

  @Patch(':slotId/snapshots/:snapshotId')
  @OAuthProtected('game_content.saves.write')
  @RateLimit({ max: 30, window: 60 })
  @ApiOperation({ summary: '固定或取消固定快照', description: '固定版本不会参与自动历史清理；删除整个 Slot 时仍会随之删除。' })
  pin(@Req() req: any, @Param('slotId') slotId: string, @Param('snapshotId') snapshotId: string, @Body() body: PatchGameSaveSnapshotDto) {
    return this.saves.setPinned(req.user.id, slotId, snapshotId, body.pinned, this.actor(req));
  }

  @Delete(':slotId/snapshots/:snapshotId')
  @OAuthProtected('game_content.saves.delete')
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({ summary: '删除历史快照', description: '当前 Snapshot 不能单独删除；对象在引用数归零并经过宽限期后回收。' })
  deleteSnapshot(@Req() req: any, @Param('slotId') slotId: string, @Param('snapshotId') snapshotId: string) {
    return this.saves.deleteSnapshot(req.user.id, slotId, snapshotId, this.actor(req));
  }

  @Post(':slotId/uploads')
  @OAuthProtected('game_content.saves.write')
  @RateLimit({ max: 20, window: 300 })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: '按账号重放同一上传会话请求，保留 24 小时。' })
  @ApiOperation({ summary: '创建上传会话', description: '服务端校验所有权、冲突、哈希、文件大小与配额后，返回仅供当前账号上传到论坛的文件接口地址。' })
  createUpload(@Req() req: any, @Param('slotId') slotId: string, @Body() body: CreateGameSaveUploadDto,
    @Headers('idempotency-key') key?: string) {
    return this.saves.createUpload(req.user.id, slotId, body, this.actor(req, body.device_id), key);
  }

  @Put('uploads/:uploadId/file')
  @OAuthProtected('game_content.saves.write')
  @RateLimit({ max: 20, window: 300 })
  @ApiConsumes('application/octet-stream')
  @ApiOperation({ summary: '上传存档文件', description: '使用当前 OAuth Bearer 将原始文件流写入论坛持久化目录，服务端校验大小和 SHA-256。' })
  uploadFile(@Req() req: any, @Param('uploadId') uploadId: string) {
    return this.saves.receiveUpload(req.user.id, uploadId, req, this.actor(req));
  }

  @Post('uploads/:uploadId/commit')
  @OAuthProtected('game_content.saves.write')
  @RateLimit({ max: 30, window: 300 })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: '按账号重放同一提交操作，保留 24 小時。' })
  @ApiOperation({ summary: '校验并提交上传', description: '控制面流式读取对象校验大小与 SHA-256，然后在短事务中锁定 Slot 并创建不可变 Snapshot。' })
  commit(@Req() req: any, @Param('uploadId') uploadId: string, @Headers('idempotency-key') key?: string) {
    return this.saves.commitUpload(req.user.id, uploadId, this.actor(req), key);
  }

  @Delete('uploads/:uploadId')
  @OAuthProtected('game_content.saves.write')
  @RateLimit({ max: 20, window: 300 })
  @ApiOperation({ summary: '取消未提交上传', description: '取消会话并安排对象在后台清理。' })
  cancelUpload(@Req() req: any, @Param('uploadId') uploadId: string) { return this.saves.cancelUpload(req.user.id, uploadId, this.actor(req)); }

  private actor(req: any, deviceId?: string): CloudSaveActor {
    return { clientId: req.authContext?.clientId, deviceId, requestId: req.requestId, ip: getClientIp(req), userAgent: req.headers?.['user-agent'] };
  }
}
