import { Type } from 'class-transformer';
import {
  IsEnum, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMultiplayerSessionDto {
  @ApiProperty({ example: 'mindustry', maxLength: 128, description: '游戏的稳定标识。' })
  @IsString() @MaxLength(128)
  game_id: string;

  @ApiPropertyOptional({ example: 'v157', maxLength: 64, description: '游戏版本。' })
  @IsOptional() @IsString() @MaxLength(64)
  game_version?: string;

  @ApiPropertyOptional({ example: '正在游玩 Salt Flats', maxLength: 160, description: '向好友展示的活动文字。' })
  @IsOptional() @IsString() @MaxLength(160)
  activity_name?: string;

  @ApiPropertyOptional({ enum: ['private', 'friends', 'unlisted'], example: 'friends', description: 'Session 可见范围。' })
  @IsOptional() @IsEnum(['private', 'friends', 'unlisted'])
  visibility?: 'private' | 'friends' | 'unlisted';

  @ApiPropertyOptional({ enum: ['open', 'friends', 'request', 'invite_only'], example: 'friends', description: '其他玩家加入 Session 的策略。' })
  @IsOptional() @IsEnum(['open', 'friends', 'request', 'invite_only'])
  join_policy?: 'open' | 'friends' | 'request' | 'invite_only';

  @ApiPropertyOptional({ minimum: 2, maximum: 64, example: 8, description: 'Peer 最大数量。' })
  @IsOptional() @IsInt() @Min(2) @Max(64)
  max_players?: number;
}

export class JoinMultiplayerSessionDto {
  @ApiPropertyOptional({ example: 'invite_opaque_id', maxLength: 128, description: '有效邀请 ID。' })
  @IsOptional() @IsString() @MaxLength(128)
  invite_id?: string;

  @ApiPropertyOptional({ example: '<RESUME_TOKEN>', maxLength: 256, description: '此前加入时签发的恢复令牌。' })
  @IsOptional() @IsString() @MaxLength(256)
  resume_token?: string;

  @ApiPropertyOptional({ example: 'ABCD1234', maxLength: 32, description: 'Unlisted Session 的加入码。' })
  @IsOptional() @IsString() @MaxLength(32)
  join_code?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, description: '客户端支持能力的 JSON 对象。' })
  @IsOptional() @IsObject()
  capabilities?: Record<string, unknown>;
}

export class ResolveSessionCodeDto {
  @ApiProperty({ example: 'ABCD1234', maxLength: 32, description: '待解析的 Session 加入码。' })
  @IsString() @MaxLength(32)
  code: string;
}

export class CandidatePayloadDto {
  @ApiProperty({ enum: ['local', 'public', 'relay'], example: 'public', description: '网络候选地址类型。' })
  @IsEnum(['local', 'public', 'relay'])
  kind: 'local' | 'public' | 'relay';

  @ApiProperty({ enum: ['udp', 'tcp', 'quic', 'custom'], example: 'udp', description: '候选地址使用的传输类型。' })
  @IsEnum(['udp', 'tcp', 'quic', 'custom'])
  transport: 'udp' | 'tcp' | 'quic' | 'custom';

  @ApiProperty({ example: '203.0.113.10', maxLength: 255, description: '候选端点地址。' })
  @IsString() @MaxLength(255)
  address: string;

  @ApiProperty({ minimum: 1, maximum: 65535, example: 6567, description: '候选端点端口。' })
  @IsInt() @Min(1) @Max(65535)
  port: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 65535, example: 100, description: '客户端候选优先级。' })
  @IsOptional() @IsInt() @Min(0) @Max(65535)
  priority?: number;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, description: '由客户端自定义的候选元数据。' })
  @IsOptional() @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateCandidateDto {
  @ApiProperty({ type: () => CandidatePayloadDto, description: '待发布的连接候选。' })
  @ValidateNested() @Type(() => CandidatePayloadDto)
  candidate: CandidatePayloadDto;
}

export class CreateMultiplayerInviteDto {
  @ApiProperty({ example: 'session_opaque_id', maxLength: 48, description: '目标 Session ID。' })
  @IsString() @MaxLength(48)
  session_id: string;

  @ApiProperty({ minimum: 1, example: 123, description: '被邀请的论坛用户 ID。' })
  @IsInt() @Min(1)
  target_user_id: number;
}

export class CreateJoinIntentDto {
  @ApiPropertyOptional({ example: 'ABCD1234', maxLength: 32, description: 'Unlisted Session 加入码。' })
  @IsOptional() @IsString() @MaxLength(32)
  join_code?: string;
}

export class JoinIntentConsumeDto {
  @ApiPropertyOptional({ type: 'object', additionalProperties: true, description: '客户端支持能力的 JSON 对象。' })
  @IsOptional() @IsObject()
  capabilities?: Record<string, unknown>;
}

export class SetDefaultMultiplayerClientDto {
  @ApiPropertyOptional({ example: 'desktop-launcher', maxLength: 128, description: '默认处理多人加入意图的 Public Client ID；null 或省略表示清除。' })
  @IsOptional() @IsString() @MaxLength(128)
  client_id?: string;
}

export class RelayAgentRegisterDto {
  @ApiProperty({ example: 'relay-eu-1', maxLength: 96, description: 'Relay Agent 稳定标识。' })
  @IsString() @MaxLength(96)
  agent_id: string;

  @ApiProperty({ example: 'wss://relay.example.invalid:443/relay/v1', maxLength: 255, description: 'Agent 对客户端公开的 Multiplayer V1 WSS 数据连接地址。' })
  @IsString() @MaxLength(255)
  endpoint: string;

  @ApiPropertyOptional({ example: 'eu-west', maxLength: 32, description: 'Agent 所在区域。' })
  @IsOptional() @IsString() @MaxLength(32)
  region?: string;

  @ApiProperty({ minimum: 1, maximum: 10000, example: 100, description: '该 Agent 可接受的分配容量。' })
  @IsInt() @Min(1) @Max(10000)
  capacity: number;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, description: 'Agent 功能能力声明。' })
  @IsOptional() @IsObject()
  capabilities?: Record<string, unknown>;
}

export class RelayAllocationAckDto {
  @ApiProperty({ example: 'allocation_opaque_id', maxLength: 48, description: '待确认的 Relay 分配 ID。' })
  @IsString() @MaxLength(48)
  allocation_id: string;

  @ApiProperty({ example: '<RELAY_CREDENTIAL>', maxLength: 2048, description: '客户端在 WSS AUTH 帧中提交的短期 credential；Agent 通过 HTTPS 和机器凭证提交给 Control Plane。' })
  @IsString() @MaxLength(2048)
  credential: string;

  @ApiProperty({ example: 'conn_01J...', maxLength: 128, description: 'Agent 为当前 WSS 连接生成的稳定 ID；内部请求重试必须复用。' })
  @IsString() @MinLength(1) @MaxLength(128)
  connection_id: string;
}

export class RelayAllocationRevokeDto {
  @ApiProperty({ example: 'allocation_opaque_id', maxLength: 48, description: '待撤销的 Relay 分配 ID。' })
  @IsString() @MaxLength(48)
  allocation_id: string;

  @ApiPropertyOptional({ example: 'conn_01J...', maxLength: 128, description: '已连接分配必须提供原 connection_id；未消费的分配可省略。' })
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128)
  connection_id?: string;
}
