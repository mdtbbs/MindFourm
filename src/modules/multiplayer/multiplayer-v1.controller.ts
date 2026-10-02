import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../common/decorators/api-v1.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { SkipPhoneVerification } from '../../common/decorators/skip-phone-verification.decorator';
import { MultiplayerOAuthProtected } from './multiplayer-oauth-protected.decorator';
import { MultiplayerService } from './multiplayer.service';
import {
  CreateCandidateDto, CreateJoinIntentDto, CreateMultiplayerInviteDto, CreateMultiplayerSessionDto,
  JoinIntentConsumeDto, JoinMultiplayerSessionDto, ResolveSessionCodeDto,
  RelayAgentRegisterDto, RelayAllocationAckDto, RelayAllocationRevokeDto, SetDefaultMultiplayerClientDto,
} from './dto/multiplayer.dto';
import { RelayInternalAuthGuard } from './relay-internal-auth.guard';

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
  @Post('sessions/resolve-code')
  resolveCode(@Body() body: ResolveSessionCodeDto, @Req() request: any) {
    return this.multiplayer.resolveCode(request.user.id, body.code);
  }

  @MultiplayerOAuthProtected('multiplayer.read')
  @Get('sessions/:id')
  getSession(@Param('id') id: string, @Req() request: any) { return this.multiplayer.getSession(request.user.id, id); }

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
  invites(@Req() request: any) { return this.multiplayer.listInvites(request.user.id); }

  @ApiTags('联机邀请')
  @MultiplayerOAuthProtected('multiplayer.write')
  @Post('invites/:id/accept')
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
    return this.multiplayer.revokeRelayAllocation(id, body.allocation_id, body.connection_id);
  }
}
