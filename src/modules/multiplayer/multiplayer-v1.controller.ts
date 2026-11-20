import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../common/decorators/api-v1.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { SkipPhoneVerification } from '../../common/decorators/skip-phone-verification.decorator';
import { MultiplayerOAuthProtected } from './multiplayer-oauth-protected.decorator';
import { MultiplayerService } from './multiplayer.service';
import {
  CreateCandidateDto, CreateJoinIntentDto, CreateMultiplayerInviteDto, CreateMultiplayerSessionDto,
  JoinIntentConsumeDto, JoinMultiplayerSessionDto, ListJoinRequestsDto, ListMultiplayerInvitesDto, ListMultiplayerSessionsDto, ModSyncPlanDto, ResolveSessionCodeDto,
  RelayAgentRegisterDto, RelayAllocationAckDto, RelayAllocationRevokeDto, SetDefaultMultiplayerClientDto,
} from './dto/multiplayer.dto';
import { RelayInternalAuthGuard } from './relay-internal-auth.guard';

const ACCEPT_INVITE_RESPONSE_SCHEMA: any = {
  type: 'object',
  required: ['invite_id', 'status', 'join_intent'],
  properties: {
    invite_id: { type: 'string', example: 'inv_AbCdEf0123456789_-wxyz', description: '已接受的邀请 ID。' },
    status: { type: 'string', enum: ['accepted'], example: 'accepted', description: '邀请状态。' },
    join_intent: {
      type: 'object',
      required: ['intent_id', 'expires_in'],
      properties: {
        intent_id: { type: 'string', example: 'jnt_AbCdEf0123456789_-wxyz', description: '传给 join-intents/{id}/consume 的一次性加入意图 ID。' },
        expires_in: { type: 'integer', example: 60, description: '加入意图首次消费前剩余有效秒数。' },
      },
    },
  },
};

const MULTIPLAYER_SESSION_LIST_SCHEMA: any = {
  type: 'object', required: ['data', 'meta'], properties: {
    data: { type: 'array', items: { type: 'object', required: ['id', 'current_players', 'max_players', 'joinable', 'blocked_reason', 'can_request_join'], properties: {
      id: { type: 'string', example: 'ses_AbCdEf0123456789_-wxyz' },
      owner_user_id: { type: 'integer' }, visibility: { type: 'string' }, join_policy: { type: 'string' },
      require_approval: { type: 'boolean' }, game: { type: 'object', additionalProperties: true },
      activity_name: { type: 'string', nullable: true }, current_players: { type: 'integer' }, max_players: { type: 'integer' },
      status: { type: 'string' }, expires_at: { type: 'string', format: 'date-time' },
      is_modded: { type: 'boolean', description: '是否为模组房。' },
      mod_count: { type: 'integer', description: '房主上报的 Mod 数量。' },
      mod_syncable_count: { type: 'integer', description: '服务端可校验并自动下发授权的 Mod 数量。' },
      mod_summary: { type: 'object', additionalProperties: true, description: '大厅摘要；mods 最多前 8 项，完整清单读取单会话。' },
      joinable: { type: 'boolean', description: '当前调用者能否直接加入。' },
      blocked_reason: { type: 'string', nullable: true, description: '不能直接加入时的稳定原因码。' },
      can_request_join: { type: 'boolean', description: '是否可改为请求房主批准。' },
    } } },
    meta: { type: 'object', required: ['request_id', 'pagination'], properties: {
      request_id: { type: 'string', example: 'req_...' },
      pagination: { type: 'object', required: ['page', 'limit', 'total', 'total_pages', 'has_more'], properties: {
        page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' },
        total_pages: { type: 'integer' }, has_more: { type: 'boolean' },
      } },
    } },
  },
};

const MOD_SYNC_PLAN_RESPONSE_SCHEMA: any = {
  type: 'object', required: ['plan_version', 'session_id', 'status', 'generated_at', 'mod_summary', 'to_download', 'to_enable', 'to_disable', 'preserved_client_mods', 'unresolved', 'limits'], properties: {
    plan_version: { type: 'integer', example: 1 },
    session_id: { type: 'string', example: 'ses_AbCdEf0123456789_-wxyz' },
    status: { type: 'string', enum: ['ready', 'sync_required', 'partial_sync_required'], description: 'ready 可直接加入；sync_required 需同步；partial_sync_required 表示仍有需手动获取的 Mod，但可先拉齐可同步项。' },
    generated_at: { type: 'string', format: 'date-time' },
    mod_summary: { type: 'object', additionalProperties: true, description: '房主 Mod 清单与可同步计数。' },
    to_download: { type: 'array', items: { type: 'object', required: ['mod_id', 'sha256', 'resource_public_id', 'file_public_id', 'download_url', 'granted'], properties: {
      mod_id: { type: 'string' }, display_name: { type: 'string', nullable: true }, version: { type: 'string', nullable: true },
      sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' }, size_bytes: { type: 'integer', nullable: true },
      resource_public_id: { type: 'string', format: 'uuid' }, resource_version_public_id: { type: 'string', format: 'uuid' },
      file_public_id: { type: 'string', format: 'uuid' }, download_url: { type: 'string', format: 'uri-reference' },
      reason: { type: 'string', enum: ['missing', 'hash_mismatch', 'unverified'] },
      granted: { type: 'boolean', description: 'false 表示该文件在 60 秒滚动窗口内已有同账号授权记录。' },
    } } },
    to_enable: { type: 'array', items: { type: 'object', additionalProperties: true } },
    to_disable: { type: 'array', items: { type: 'object', additionalProperties: true } },
    preserved_client_mods: { type: 'array', items: { type: 'object', additionalProperties: true }, description: '纯客户端辅助 Mod，默认保留不禁用。' },
    unresolved: { type: 'array', items: { type: 'object', required: ['mod_id', 'reason', 'resolution_status'], properties: {
      mod_id: { type: 'string' }, display_name: { type: 'string', nullable: true }, version: { type: 'string', nullable: true },
      sha256: { type: 'string', nullable: true },
      reason: { type: 'string', enum: ['not_in_catalog', 'sha256_missing', 'catalog_file_unavailable', 'catalog_version_mismatch'] },
      resolution_status: { type: 'string', enum: ['catalog_version_mismatch', 'unlisted_local'] },
      resource_public_id: { type: 'string', nullable: true }, resource_version_public_id: { type: 'string', nullable: true },
    } } },
    limits: { type: 'object', additionalProperties: true },
  },
};

const MULTIPLAYER_JOIN_REQUEST_LIST_SCHEMA: any = {
  type: 'object', required: ['data', 'meta'], properties: {
    data: { type: 'array', items: { type: 'object', required: ['id', 'user', 'created_at', 'expires_at'], properties: {
      id: { type: 'string', example: 'jrq_AbCdEf0123456789_-wxyz', description: '传给 approve / reject 的加入请求 ID。' },
      created_at: { type: 'string', format: 'date-time', description: '申请创建时间。' },
      expires_at: { type: 'string', format: 'date-time', description: '申请有效期截止时间；过期后不可再批准。' },
      user: { type: 'object', nullable: true, required: ['id', 'username', 'avatar_url'], properties: {
        id: { type: 'integer', example: 123 },
        username: { type: 'string', example: 'builder' },
        avatar_url: { type: 'string', nullable: true },
      }, description: '申请者公开资料；账号被删除时该会话行随外键级联删除，正常返回不会为 null。' },
    } } },
    meta: { type: 'object', required: ['request_id', 'pagination'], properties: {
      request_id: { type: 'string', example: 'req_...' },
      pagination: { type: 'object', required: ['page', 'limit', 'total', 'total_pages', 'has_more'], properties: {
        page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' },
        total_pages: { type: 'integer' }, has_more: { type: 'boolean' },
      } },
    } },
  },
};

const MULTIPLAYER_INVITE_LIST_SCHEMA: any = {
  type: 'object', required: ['data', 'meta'], properties: {
    data: { type: 'array', items: { type: 'object', required: ['invite_id', 'session_id', 'sender_user_id', 'target_user_id', 'status', 'expires_at'], properties: {
      invite_id: { type: 'string' }, session_id: { type: 'string' }, sender_user_id: { type: 'integer' },
      target_user_id: { type: 'integer' }, status: { type: 'string' }, expires_at: { type: 'string', format: 'date-time' },
      session: { type: 'object', nullable: true, additionalProperties: true },
    } } },
    meta: { type: 'object', required: ['request_id', 'pagination'], properties: {
      request_id: { type: 'string', example: 'req_...' },
      pagination: { type: 'object', required: ['page', 'limit', 'total', 'total_pages', 'has_more'], properties: {
        page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' },
        total_pages: { type: 'integer' }, has_more: { type: 'boolean' },
      } },
    } },
  },
};

@ApiV1()
@ApiTags('联机会话')
@Controller('v1/multiplayer')
export class MultiplayerV1Controller {
  constructor(private readonly multiplayer: MultiplayerService) {}

  @MultiplayerOAuthProtected('multiplayer.read')
  @Get('capabilities')
  capabilities() { return this.multiplayer.capabilities(); }

  @MultiplayerOAuthProtected('multiplayer.read')
  @Get('preferences')
  preferences(@Req() request: any) { return this.multiplayer.getMultiplayerPreferences(request.user.id); }

  @MultiplayerOAuthProtected('multiplayer.write')
  @Patch('preferences')
  setPreferences(@Body() body: SetDefaultMultiplayerClientDto, @Req() request: any) {
    return this.multiplayer.setDefaultMultiplayerClient(request.user.id, body.client_id);
  }

  @MultiplayerOAuthProtected('multiplayer.write')
  @Post('sessions')
  @RateLimit({ max: 10, window: 60 })
  createSession(@Body() body: CreateMultiplayerSessionDto, @Req() request: any) {
    return this.multiplayer.createSession(request.user.id, request.authContext?.clientId || 'forum_web', body);
  }

  @MultiplayerOAuthProtected('multiplayer.read')
  @Get('sessions')
  @ApiOkResponse({ description: '标准成功信封；data 是数组，分页摘要位于 meta.pagination。每项包含调用者可发现的会话与加入判定。', schema: MULTIPLAYER_SESSION_LIST_SCHEMA })
  listSessions(@Query() query: ListMultiplayerSessionsDto, @Req() request: any) {
    return this.multiplayer.listDiscoverableSessions(request.user.id, query);
  }

  @MultiplayerOAuthProtected('multiplayer.read')
  @Post('sessions/resolve-code')
  resolveCode(@Body() body: ResolveSessionCodeDto, @Req() request: any) {
    return this.multiplayer.resolveCode(request.user.id, body.code);
  }

  @MultiplayerOAuthProtected('multiplayer.read')
  @Get('sessions/:id')
  getSession(@Param('id') id: string, @Req() request: any) { return this.multiplayer.getSession(request.user.id, id); }

  @MultiplayerOAuthProtected('multiplayer.read', 'resource.read')
  @Post('sessions/:id/mod-sync-plan')
  @RateLimit({ max: 60, window: 60 })
  @ApiOperation({ operationId: 'createMultiplayerSessionModSyncPlan', summary: '计算加入模组房所需的同步计划并批量签发下载授权' })
  @ApiOkResponse({ description: '标准成功信封；data 是按房主清单与本地已安装 Mod 计算出的同步计划。', schema: MOD_SYNC_PLAN_RESPONSE_SCHEMA })
  modSyncPlan(@Param('id') id: string, @Body() body: ModSyncPlanDto, @Req() request: any) {
    return this.multiplayer.createModSyncPlan(request.user.id, id, body, request);
  }

  @MultiplayerOAuthProtected('multiplayer.write')
  @Post('sessions/:id/join')
  @RateLimit({ max: 30, window: 60 })
  join(@Param('id') id: string, @Body() body: JoinMultiplayerSessionDto, @Req() request: any) {
    return this.multiplayer.joinSession(request.user.id, request.authContext?.clientId || 'forum_web', id, body);
  }

  @MultiplayerOAuthProtected('multiplayer.write')
  @Post('sessions/:id/leave')
  leave(@Param('id') id: string, @Req() request: any) { return this.multiplayer.leaveSession(request.user.id, id); }

  @MultiplayerOAuthProtected('multiplayer.read')
  @Get('sessions/:id/peers')
  peers(@Param('id') id: string, @Req() request: any) { return this.multiplayer.listPeers(request.user.id, id); }

  @MultiplayerOAuthProtected('multiplayer.write')
  @Post('sessions/:id/peers/:peerId/heartbeat')
  heartbeat(@Param('id') id: string, @Param('peerId') peerId: string, @Req() request: any) {
    return this.multiplayer.heartbeat(request.user.id, id, peerId);
  }

  @MultiplayerOAuthProtected('multiplayer.write')
  @Post('sessions/:id/candidates')
  @RateLimit({ max: 120, window: 60 })
  addCandidate(@Param('id') id: string, @Body() body: CreateCandidateDto, @Req() request: any) {
    return this.multiplayer.addCandidate(request.user.id, id, body.candidate);
  }

  @MultiplayerOAuthProtected('multiplayer.read')
  @Get('sessions/:id/peers/:peerId/candidates')
  @RateLimit({ max: 120, window: 60 })
  candidates(@Param('id') id: string, @Param('peerId') peerId: string, @Req() request: any) {
    return this.multiplayer.getCandidates(request.user.id, id, peerId);
  }

  @MultiplayerOAuthProtected('multiplayer.write')
  @Delete('sessions/:id/candidates/:candidateId')
  removeCandidate(@Param('id') id: string, @Param('candidateId') candidateId: string, @Req() request: any) {
    return this.multiplayer.removeCandidate(request.user.id, id, candidateId);
  }

  @ApiTags('联机邀请')
  @MultiplayerOAuthProtected('multiplayer.write')
  @Post('invites')
  @RateLimit({ max: 20, window: 60 })
  createInvite(@Body() body: CreateMultiplayerInviteDto, @Req() request: any) {
    return this.multiplayer.createInvite(request.user.id, body);
  }

  @ApiTags('联机邀请')
  @MultiplayerOAuthProtected('multiplayer.read')
  @Get('invites')
  @ApiOkResponse({ description: '标准成功信封；data 是数组，分页摘要位于 meta.pagination。', schema: MULTIPLAYER_INVITE_LIST_SCHEMA })
  invites(@Query() query: ListMultiplayerInvitesDto, @Req() request: any) {
    return this.multiplayer.listInvites(request.user.id, query);
  }

  @ApiTags('联机邀请')
  @MultiplayerOAuthProtected('multiplayer.write')
  @Post('invites/:id/accept')
  @ApiOkResponse({
    description: '成功响应使用标准 {data, meta} 信封；本 schema 描述 data 中的业务字段。接受邀请后客户端随后调用 POST /api/v1/multiplayer/join-intents/{intent_id}/consume。',
    schema: ACCEPT_INVITE_RESPONSE_SCHEMA,
  })
  acceptInvite(@Param('id') id: string, @Req() request: any) { return this.multiplayer.acceptInvite(request.user.id, id); }

  @ApiTags('联机邀请')
  @MultiplayerOAuthProtected('multiplayer.write')
  @Post('invites/:id/decline')
  declineInvite(@Param('id') id: string, @Req() request: any) { return this.multiplayer.declineInvite(request.user.id, id); }

  @ApiTags('联机邀请')
  @MultiplayerOAuthProtected('multiplayer.write')
  @Post('invites/:id/revoke')
  revokeInvite(@Param('id') id: string, @Req() request: any) { return this.multiplayer.revokeInvite(request.user.id, id); }

  @ApiTags('加入请求')
  @MultiplayerOAuthProtected('multiplayer.read')
  @Get('join-requests')
  listJoinRequests(@Req() request: any) { return this.multiplayer.listJoinRequests(request.user.id); }

  @ApiTags('加入请求')
  @MultiplayerOAuthProtected('multiplayer.read')
  @Get('sessions/:id/join-requests')
  @ApiOkResponse({ description: '仅会话房主可读；data 是该会话的待处理加入申请数组（5 分钟有效），分页摘要位于 meta.pagination。', schema: MULTIPLAYER_JOIN_REQUEST_LIST_SCHEMA })
  listSessionJoinRequests(@Param('id') id: string, @Query() query: ListJoinRequestsDto, @Req() request: any) {
    return this.multiplayer.listSessionJoinRequests(request.user.id, id, query);
  }

  @ApiTags('加入请求')
  @MultiplayerOAuthProtected('multiplayer.write')
  @Post('sessions/:id/join-requests')
  @RateLimit({ max: 10, window: 60 })
  requestJoin(@Param('id') id: string, @Req() request: any) {
    return this.multiplayer.createJoinRequest(request.user.id, id, request.authContext?.clientId || 'forum_web');
  }

  @ApiTags('加入请求')
  @MultiplayerOAuthProtected('multiplayer.write')
  @Post('join-requests/:id/approve')
  approveJoin(@Param('id') id: string, @Req() request: any) { return this.multiplayer.approveJoinRequest(request.user.id, id); }

  @ApiTags('加入请求')
  @MultiplayerOAuthProtected('multiplayer.write')
  @Post('join-requests/:id/reject')
  rejectJoin(@Param('id') id: string, @Req() request: any) { return this.multiplayer.rejectJoinRequest(request.user.id, id); }

  @MultiplayerOAuthProtected('multiplayer.write')
  @Post('sessions/:id/join-intents')
  @RateLimit({ max: 20, window: 60 })
  createJoinIntent(@Param('id') id: string, @Body() body: CreateJoinIntentDto, @Req() request: any) {
    return this.multiplayer.createJoinIntent(request.user.id, id, body.join_code);
  }

  @MultiplayerOAuthProtected('multiplayer.write')
  @Post('join-intents/:id/consume')
  @RateLimit({ max: 30, window: 60 })
  consumeJoinIntent(@Param('id') id: string, @Body() body: JoinIntentConsumeDto, @Req() request: any) {
    return this.multiplayer.consumeJoinIntent(request.user.id, request.authContext?.clientId || 'forum_web', id, body.capabilities);
  }

  @ApiTags('中继')
  @MultiplayerOAuthProtected('multiplayer.write')
  @Post('sessions/:id/relay')
  @RateLimit({ max: 10, window: 60 })
  allocateRelay(@Param('id') id: string, @Req() request: any) { return this.multiplayer.allocateRelay(request.user.id, id); }
}

@Controller('internal/v1/relay/agents')
@SkipPhoneVerification()
@UseGuards(RelayInternalAuthGuard)
export class RelayInternalV1Controller {
  constructor(private readonly multiplayer: MultiplayerService) {}

  @Post('register')
  register(@Body() body: RelayAgentRegisterDto) { return this.multiplayer.registerRelayAgent(body); }

  @Post(':id/heartbeat')
  heartbeat(@Param('id') id: string) { return this.multiplayer.heartbeatRelayAgent(id); }

  @Post(':id/allocations')
  allocationAck(@Param('id') id: string, @Body() body: RelayAllocationAckDto) {
    return this.multiplayer.consumeRelayCredential(id, body);
  }

  @Post(':id/revoke')
  revoke(@Param('id') id: string, @Body() body: RelayAllocationRevokeDto) {
    return this.multiplayer.revokeRelayAllocation(id, body.allocation_id, body.connection_id, body.credential);
  }
}
