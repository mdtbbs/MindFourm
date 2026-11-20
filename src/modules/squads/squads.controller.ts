import {
  Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, Res, UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth, ApiConsumes, ApiOperation, ApiParam, ApiProduces, ApiTags,
} from '@nestjs/swagger';
import { ApiV1 } from '@common/decorators/api-v1.decorator';
import { OAuthProtected } from '@common/decorators/oauth-protected.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { SkipPhoneVerification } from '@common/decorators/skip-phone-verification.decorator';
import { getClientIp } from '@common/utils/client-context.util';
import { CloudSaveNoStoreInterceptor } from '../game-saves/cloud-save-no-store.interceptor';
import { SquadsService } from './squads.service';
import { SquadLeaseService } from './squad-lease.service';
import { SquadSaveStorageService } from './squad-save-storage.service';
import {
  AcquireSquadSaveLeaseDto, CheckSquadSaveBlobsDto, CommitSquadSaveSnapshotDto, CreateSquadDto,
  CreateSquadOwnershipTransferDto, CreateSquadSaveBlobUploadDto, CreateSquadSlotDto, InviteSquadMemberDto,
  PatchSquadDto, PatchSquadMemberDto, PatchSquadSaveSnapshotDto, PatchSquadSlotDto, ReleaseSquadSaveLeaseDto,
  RenewSquadSaveLeaseDto, RestoreSquadSaveSnapshotDto, SquadSaveBlobDownloadGrantDto,
} from './dto/squads.dto';

const READ_SCOPE = 'game_content.saves.read';
const WRITE_SCOPE = 'game_content.saves.write';
const DELETE_SCOPE = 'game_content.saves.delete';

@ApiV1()
@ApiTags('游戏内容 / 小队共享存档')
@ApiBearerAuth('MindAuthBearer')
@SkipPhoneVerification()
@UseInterceptors(CloudSaveNoStoreInterceptor)
@Controller('v1/squads')
export class SquadsController {
  constructor(
    private readonly squads: SquadsService,
    private readonly leases: SquadLeaseService,
    private readonly storage: SquadSaveStorageService,
  ) {}

  @Get()
  @OAuthProtected(READ_SCOPE)
  @RateLimit({ max: 120, window: 60 })
  @ApiOperation({ summary: '列出我的小队', description: '返回当前账号以活跃成员身份加入的小队，包含角色、成员数与存档槽数量。' })
  list(@Req() req: any) { return this.squads.listSquads(req.user.id); }

  @Get('invitations')
  @OAuthProtected(READ_SCOPE)
  @RateLimit({ max: 120, window: 60 })
  @ApiOperation({ summary: '列出收到的小队邀请', description: '返回待接受的小队邀请；用 accept / decline 处理。' })
  invitations(@Req() req: any) { return this.squads.listInvitations(req.user.id); }

  @Post()
  @OAuthProtected(WRITE_SCOPE)
  @RateLimit({ max: 10, window: 600 })
  @ApiOperation({ summary: '创建小队', description: '创建者成为队长，共享存档空间从创建者的个人云存档配额中统一扣除。' })
  create(@Req() req: any, @Body() body: CreateSquadDto) { return this.squads.createSquad(req.user.id, body, this.actor(req)); }

  @Get(':squadId')
  @OAuthProtected(READ_SCOPE)
  @RateLimit({ max: 120, window: 60 })
  @ApiParam({ name: 'squadId', description: '小队 UUID' })
  @ApiOperation({ summary: '查看小队详情', description: '返回成员、共享存档槽、当前租约持有者与待确认的队长转让。' })
  get(@Req() req: any, @Param('squadId') squadId: string) { return this.squads.getSquad(req.user.id, squadId); }

  @Patch(':squadId')
  @OAuthProtected(WRITE_SCOPE)
  @RateLimit({ max: 30, window: 60 })
  @ApiOperation({ summary: '重命名小队', description: '队长或管理员可修改小队名称。' })
  rename(@Req() req: any, @Param('squadId') squadId: string, @Body() body: PatchSquadDto) {
    return this.squads.renameSquad(req.user.id, squadId, body, this.actor(req));
  }

  @Delete(':squadId')
  @OAuthProtected(DELETE_SCOPE)
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({ summary: '删除小队', description: '只有队长可删除；共享存档槽与快照软删除，blob 引用释放并进入延迟回收。' })
  remove(@Req() req: any, @Param('squadId') squadId: string) { return this.squads.deleteSquad(req.user.id, squadId, this.actor(req)); }

  @Get(':squadId/members')
  @OAuthProtected(READ_SCOPE)
  @RateLimit({ max: 120, window: 60 })
  @ApiOperation({ summary: '列出小队成员', description: '活跃成员与待接受邀请的成员及其角色。' })
  async members(@Req() req: any, @Param('squadId') squadId: string) {
    const detail = await this.squads.getSquad(req.user.id, squadId);
    return detail.members;
  }

  @Post(':squadId/members')
  @OAuthProtected(WRITE_SCOPE)
  @RateLimit({ max: 30, window: 60 })
  @ApiOperation({ summary: '邀请好友加入小队', description: '只有好友可以被邀请；被邀请人通过 accept / decline 处理。' })
  invite(@Req() req: any, @Param('squadId') squadId: string, @Body() body: InviteSquadMemberDto) {
    return this.squads.inviteMember(req.user.id, squadId, body, this.actor(req));
  }

  @Post(':squadId/members/accept')
  @OAuthProtected(WRITE_SCOPE)
  @RateLimit({ max: 30, window: 60 })
  @ApiOperation({ summary: '接受小队邀请', description: '接受后成为活跃成员；小队满员时返回 SQUAD_MEMBER_LIMIT_EXCEEDED。' })
  acceptInvite(@Req() req: any, @Param('squadId') squadId: string) {
    return this.squads.acceptInvitation(req.user.id, squadId, this.actor(req));
  }

  @Post(':squadId/members/decline')
  @OAuthProtected(WRITE_SCOPE)
  @RateLimit({ max: 30, window: 60 })
  @ApiOperation({ summary: '拒绝小队邀请', description: '拒绝后邀请失效，可由队长或管理员重新邀请。' })
  declineInvite(@Req() req: any, @Param('squadId') squadId: string) {
    return this.squads.declineInvitation(req.user.id, squadId, this.actor(req));
  }

  @Patch(':squadId/members/:userId')
  @OAuthProtected(WRITE_SCOPE)
  @RateLimit({ max: 30, window: 60 })
  @ApiOperation({ summary: '设置成员角色', description: '只有队长可以把成员设为管理员或降为普通成员；队长角色只能通过两步转让切换。' })
  setRole(@Req() req: any, @Param('squadId') squadId: string, @Param('userId') userId: string, @Body() body: PatchSquadMemberDto) {
    return this.squads.setMemberRole(req.user.id, squadId, Number(userId), body, this.actor(req));
  }

  @Delete(':squadId/members/:userId')
  @OAuthProtected(WRITE_SCOPE)
  @RateLimit({ max: 30, window: 60 })
  @ApiOperation({ summary: '退出或移除小队成员', description: '成员可退出自己；队长/管理员可移除成员。队长必须先完成转让。' })
  removeMember(@Req() req: any, @Param('squadId') squadId: string, @Param('userId') userId: string) {
    return this.squads.removeMember(req.user.id, squadId, Number(userId), this.actor(req));
  }

  @Post(':squadId/ownership-transfer')
  @OAuthProtected(WRITE_SCOPE)
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({ summary: '发起队长转让', description: '现任队长指定一名活跃成员，创建 24 小时内有效的待确认转让；同一小队至多一条。' })
  createTransfer(@Req() req: any, @Param('squadId') squadId: string, @Body() body: CreateSquadOwnershipTransferDto) {
    return this.squads.createOwnershipTransfer(req.user.id, squadId, body, this.actor(req));
  }

  @Post(':squadId/ownership-transfer/accept')
  @OAuthProtected(WRITE_SCOPE)
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({ summary: '接受队长转让', description: '事务内按 ORDER BY id ASC 锁定新旧队长，校验新队长剩余配额后原子切换 owner 与 billing_user_id。' })
  acceptTransfer(@Req() req: any, @Param('squadId') squadId: string) {
    return this.squads.acceptOwnershipTransfer(req.user.id, squadId, this.actor(req));
  }

  @Post(':squadId/ownership-transfer/decline')
  @OAuthProtected(WRITE_SCOPE)
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({ summary: '拒绝队长转让', description: '只有被指定的新队长可以拒绝。' })
  declineTransfer(@Req() req: any, @Param('squadId') squadId: string) {
    return this.squads.declineOwnershipTransfer(req.user.id, squadId, this.actor(req));
  }

  @Post(':squadId/ownership-transfer/cancel')
  @OAuthProtected(WRITE_SCOPE)
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({ summary: '取消队长转让', description: '只有现任队长可以取消待确认的转让。' })
  cancelTransfer(@Req() req: any, @Param('squadId') squadId: string) {
    return this.squads.cancelOwnershipTransfer(req.user.id, squadId, this.actor(req));
  }

  @Get(':squadId/slots')
  @OAuthProtected(READ_SCOPE)
  @RateLimit({ max: 120, window: 60 })
  @ApiOperation({ summary: '列出共享存档槽', description: '返回槽位、当前主链 head 与租约持有者摘要。' })
  async slots(@Req() req: any, @Param('squadId') squadId: string) {
    const detail = await this.squads.getSquad(req.user.id, squadId);
    return detail.slots;
  }

  @Post(':squadId/slots')
  @OAuthProtected(WRITE_SCOPE)
  @RateLimit({ max: 20, window: 60 })
  @ApiOperation({ summary: '创建共享存档槽', description: '任意活跃成员可创建；数量受小队 max_slots 限制。' })
  createSlot(@Req() req: any, @Param('squadId') squadId: string, @Body() body: CreateSquadSlotDto) {
    return this.squads.createSlot(req.user.id, squadId, body, this.actor(req));
  }

  @Get(':squadId/slots/:slotId')
  @OAuthProtected(READ_SCOPE)
  @RateLimit({ max: 120, window: 60 })
  @ApiOperation({ summary: '查看共享存档槽', description: '返回槽位、主链 head、当前租约和置顶数量。' })
  getSlot(@Req() req: any, @Param('squadId') squadId: string, @Param('slotId') slotId: string) {
    return this.storage.getSlot(req.user.id, squadId, slotId);
  }

  @Patch(':squadId/slots/:slotId')
  @OAuthProtected(WRITE_SCOPE)
  @RateLimit({ max: 30, window: 60 })
  @ApiOperation({ summary: '重命名共享存档槽', description: '任意活跃成员可重命名槽位。' })
  renameSlot(@Req() req: any, @Param('squadId') squadId: string, @Param('slotId') slotId: string, @Body() body: PatchSquadSlotDto) {
    return this.squads.renameSlot(req.user.id, squadId, slotId, body, this.actor(req));
  }

  @Delete(':squadId/slots/:slotId')
  @OAuthProtected(DELETE_SCOPE)
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({ summary: '删除共享存档槽', description: '队长或管理员可删除；快照软删除、blob 引用释放并回收配额。' })
  deleteSlot(@Req() req: any, @Param('squadId') squadId: string, @Param('slotId') slotId: string) {
    return this.squads.deleteSlot(req.user.id, squadId, slotId, this.actor(req));
  }

  // ------------------------------------------------------------------ 租约

  @Get(':squadId/slots/:slotId/lease')
  @OAuthProtected(READ_SCOPE)
  @RateLimit({ max: 120, window: 60 })
  @ApiOperation({ summary: '查看写租约状态', description: '返回当前有效租约（holder、fencing_token、到期时间）以及调用者是否持有。' })
  leaseStatus(@Req() req: any, @Param('squadId') squadId: string, @Param('slotId') slotId: string) {
    return this.leases.getStatus(req.user.id, squadId, slotId);
  }

  @Post(':squadId/slots/:slotId/lease/acquire')
  @OAuthProtected(WRITE_SCOPE)
  @RateLimit({ max: 30, window: 60 })
  @ApiOperation({ summary: '获取写租约', description: '自然到期（150 秒）后任意活跃成员可接力；未到期时返回 409 SQUAD_SAVE_LEASE_HELD，owner/admin 可 force_takeover 强制接管。' })
  acquireLease(@Req() req: any, @Param('squadId') squadId: string, @Param('slotId') slotId: string, @Body() body: AcquireSquadSaveLeaseDto) {
    return this.leases.acquire(req.user.id, this.clientId(req), squadId, slotId, body);
  }

  @Post(':squadId/slots/:slotId/lease/renew')
  @OAuthProtected(WRITE_SCOPE)
  @RateLimit({ max: 120, window: 60 })
  @ApiOperation({ summary: '续期写租约', description: '当前持有者用 fencing_token 续期；接通 90 秒心跳节奏，租约每次延长 150 秒。' })
  renewLease(@Req() req: any, @Param('squadId') squadId: string, @Param('slotId') slotId: string, @Body() body: RenewSquadSaveLeaseDto) {
    return this.leases.renew(req.user.id, this.clientId(req), squadId, slotId, body);
  }

  @Delete(':squadId/slots/:slotId/lease')
  @OAuthProtected(WRITE_SCOPE)
  @RateLimit({ max: 30, window: 60 })
  @ApiOperation({ summary: '释放写租约', description: '仅当前持有者可释放；可选 fencing_token 防止误释放已被接管的租约。' })
  releaseLease(@Req() req: any, @Param('squadId') squadId: string, @Param('slotId') slotId: string, @Body() body: ReleaseSquadSaveLeaseDto) {
    return this.leases.release(req.user.id, squadId, slotId, body?.fencing_token);
  }

  // ------------------------------------------------------------------ 快照

  @Get(':squadId/slots/:slotId/snapshots')
  @OAuthProtected(READ_SCOPE)
  @RateLimit({ max: 120, window: 60 })
  @ApiOperation({ summary: '查看快照链', description: '按 revision 从新到旧返回主链与 conflict 救援分支，标注 head、pinned 与保留层级。' })
  snapshots(@Req() req: any, @Param('squadId') squadId: string, @Param('slotId') slotId: string) {
    return this.storage.listSnapshots(req.user.id, squadId, slotId);
  }

  @Post(':squadId/slots/:slotId/snapshots')
  @OAuthProtected(WRITE_SCOPE)
  @RateLimit({ max: 30, window: 60 })
  @ApiOperation({ summary: '提交共享存档快照', description: '持有当前 fencing_token 才能推进主链；过期 token 返回 409 SQUAD_SAVE_LEASE_STALE，可用 mode=conflict_rescue 保存为 conflict 分支。提交成功后同步执行 GFS 裁剪。' })
  commitSnapshot(@Req() req: any, @Param('squadId') squadId: string, @Param('slotId') slotId: string,
    @Body() body: CommitSquadSaveSnapshotDto) {
    return this.storage.commitSnapshot(req.user.id, squadId, slotId, body, this.actor(req, body.device_id));
  }

  @Get(':squadId/slots/:slotId/snapshots/:snapshotId/manifest')
  @OAuthProtected(READ_SCOPE)
  @RateLimit({ max: 120, window: 60 })
  @ApiOperation({ summary: '读取快照文件清单', description: '返回 path / size / sha256 与游戏、Mod 元数据。' })
  manifest(@Req() req: any, @Param('squadId') squadId: string, @Param('slotId') slotId: string, @Param('snapshotId') snapshotId: string) {
    return this.storage.getManifest(req.user.id, squadId, slotId, snapshotId);
  }

  @Post(':squadId/slots/:slotId/snapshots/:snapshotId/restore')
  @OAuthProtected(WRITE_SCOPE)
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({ summary: '恢复历史或冲突分支', description: '创建新的主链 revision，不删除原快照；必须持有当前 fencing_token 并确认 head。' })
  restore(@Req() req: any, @Param('squadId') squadId: string, @Param('slotId') slotId: string,
    @Param('snapshotId') snapshotId: string, @Body() body: RestoreSquadSaveSnapshotDto) {
    return this.storage.restore(req.user.id, squadId, slotId, snapshotId, body, this.actor(req));
  }

  @Patch(':squadId/slots/:slotId/snapshots/:snapshotId')
  @OAuthProtected(WRITE_SCOPE)
  @RateLimit({ max: 30, window: 60 })
  @ApiOperation({ summary: '置顶或取消置顶快照', description: '置顶快照不参与 GFS 自动裁剪；每个存档槽最多置顶 10 个。' })
  pin(@Req() req: any, @Param('squadId') squadId: string, @Param('slotId') slotId: string,
    @Param('snapshotId') snapshotId: string, @Body() body: PatchSquadSaveSnapshotDto) {
    return this.storage.setPinned(req.user.id, squadId, slotId, snapshotId, body.pinned, this.actor(req));
  }

  @Delete(':squadId/slots/:slotId/snapshots/:snapshotId')
  @OAuthProtected(DELETE_SCOPE)
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({ summary: '删除历史或冲突快照', description: '队长或管理员可删除非 head 快照；引用归零的 blob 进入延迟回收。' })
  deleteSnapshot(@Req() req: any, @Param('squadId') squadId: string, @Param('slotId') slotId: string,
    @Param('snapshotId') snapshotId: string) {
    return this.storage.deleteSnapshot(req.user.id, squadId, slotId, snapshotId, this.actor(req));
  }

  // ------------------------------------------------------------------ 文件

  @Post(':squadId/slots/:slotId/blobs/check')
  @OAuthProtected(READ_SCOPE)
  @RateLimit({ max: 120, window: 60 })
  @ApiOperation({ summary: '查询小队已持有的文件', description: '严格限定当前小队的 squad_save_blobs 与暂存表，绝不会触达创建者个人 game_save_blobs。' })
  checkBlobs(@Req() req: any, @Param('squadId') squadId: string, @Param('slotId') slotId: string, @Body() body: CheckSquadSaveBlobsDto) {
    return this.storage.checkBlobs(req.user.id, squadId, slotId, body);
  }

  @Post(':squadId/slots/:slotId/blobs')
  @OAuthProtected(WRITE_SCOPE)
  @RateLimit({ max: 120, window: 60 })
  @ApiOperation({ summary: '创建小队文件上传会话', description: '需要持有当前写租约；配额从创建者个人云存档额度统一扣除，不足返回 409 SQUAD_OWNER_QUOTA_EXCEEDED。' })
  createBlobUpload(@Req() req: any, @Param('squadId') squadId: string, @Param('slotId') slotId: string, @Body() body: CreateSquadSaveBlobUploadDto) {
    return this.storage.createBlobUpload(req.user.id, squadId, slotId, body, this.actor(req));
  }

  @Put(':squadId/blobs/uploads/:uploadId/file')
  @OAuthProtected(WRITE_SCOPE)
  @RateLimit({ max: 60, window: 600 })
  @ApiConsumes('application/octet-stream')
  @ApiOperation({ summary: '上传小队文件字节', description: '服务端校验大小与 SHA-256；只有创建该会话的成员可以写入。' })
  uploadBlobFile(@Req() req: any, @Param('squadId') squadId: string, @Param('uploadId') uploadId: string) {
    return this.storage.receiveBlobUpload(req.user.id, squadId, uploadId, req, this.actor(req));
  }

  @Post(':squadId/slots/:slotId/snapshots/:snapshotId/blobs/download')
  @OAuthProtected(READ_SCOPE)
  @RateLimit({ max: 120, window: 60 })
  @ApiOperation({ summary: '获取快照文件下载地址', description: '为清单中指定 SHA-256 返回同源 Bearer 下载地址；客户端只需拉取本机缺失的文件。' })
  blobDownloads(@Req() req: any, @Param('squadId') squadId: string, @Param('slotId') slotId: string,
    @Param('snapshotId') snapshotId: string, @Body() body: SquadSaveBlobDownloadGrantDto) {
    return this.storage.blobDownloadGrant(req.user.id, squadId, slotId, snapshotId, body, this.actor(req));
  }

  @Get(':squadId/slots/:slotId/snapshots/:snapshotId/blobs/:sha256/file')
  @OAuthProtected(READ_SCOPE)
  @RateLimit({ max: 120, window: 300 })
  @ApiProduces('application/octet-stream')
  @ApiOperation({ summary: '下载单个小队存档文件', description: '只返回该快照清单内、且属于当前小队的文件内容；ETag 为文件 SHA-256。' })
  async blobFile(@Req() req: any, @Param('squadId') squadId: string, @Param('slotId') slotId: string,
    @Param('snapshotId') snapshotId: string, @Param('sha256') sha256: string, @Res() res: any) {
    const file = await this.storage.openBlobDownload(req.user.id, squadId, slotId, snapshotId, sha256, this.actor(req));
    const safeName = file.file_name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    res.status(200);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(file.size));
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.file_name)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('ETag', `"sha256-${file.sha256}"`);
    if (file.last_modified) res.setHeader('Last-Modified', file.last_modified.toUTCString());
    file.stream.on('error', () => {
      if (res.headersSent) res.destroy();
      else res.status(500).end();
    });
    file.stream.pipe(res);
  }

  private clientId(req: any): string {
    return String(req.authContext?.clientId || 'forum_web').slice(0, 128);
  }

  private actor(req: any, deviceId?: string) {
    return {
      clientId: req.authContext?.clientId,
      deviceId,
      requestId: req.requestId,
      ip: getClientIp(req),
      userAgent: req.headers?.['user-agent'],
    };
  }
}
