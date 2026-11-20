import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min,
  MinLength, ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 建房时房主上报的单个 Mod；`sha256` 是服务端权威定级的唯一凭据。 */
export class SessionModDto {
  @ApiProperty({ example: 'flood-driver', maxLength: 191, description: 'Mod 的稳定标识（与资源目录 mod_id 同一命名空间）。' })
  @IsString() @MinLength(1) @MaxLength(191)
  mod_id: string;

  @ApiPropertyOptional({ example: 'Flood Driver', maxLength: 255, description: '展示名称；缺省时由公开目录补齐。' })
  @IsOptional() @IsString() @MaxLength(255)
  display_name?: string;

  @ApiPropertyOptional({ example: '1.2.0', maxLength: 100, description: '房主本地版本号。' })
  @IsOptional() @IsString() @MaxLength(100)
  version?: string;

  @ApiPropertyOptional({
    example: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    maxLength: 64,
    pattern: '^[a-fA-F0-9]{64}$',
    description: '本地 Mod 文件的 SHA-256；只有与已发布版本主文件一致时才可被自动同步。',
  })
  @IsOptional() @IsString() @Matches(/^[a-fA-F0-9]{64}$/)
  sha256?: string;

  @ApiPropertyOptional({ example: true, description: '是否多人内容必需；缺省为 true。' })
  @IsOptional() @IsBoolean()
  required?: boolean;
}

/** 建房时直接引用一个已发布 Pack 的固定版本。 */
export class ModPackRefDto {
  @ApiProperty({ example: 'c0ffee00-0000-4000-8000-000000000000', maxLength: 36, description: '公开 Pack 资源的 public_id。' })
  @IsString() @MaxLength(36)
  pack_public_id: string;

  @ApiPropertyOptional({ example: 'c0ffee00-0000-4000-8000-000000000001', maxLength: 36, description: '固定 Pack 版本的 public_id；缺省时使用当前推荐已发布版本。' })
  @IsOptional() @IsString() @MaxLength(36)
  version_public_id?: string;
}

/**
 * 小队共享存档接力引用（D05/D06）。
 *
 * 创建会话时服务端会校验调用者当前持有该槽位的写租约，并把会话 ID 回填到
 * `squad_save_leases.multiplayer_session_id` 与 `squad_save_slots.active_session_id`。
 */
export class SquadSaveRefDto {
  @ApiProperty({ format: 'uuid', description: '小队 UUID。' })
  @IsString() @MaxLength(36) @MinLength(36) squad_id: string;

  @ApiProperty({ format: 'uuid', description: '共享存档槽 UUID。' })
  @IsString() @MaxLength(36) @MinLength(36) slot_id: string;

  @ApiProperty({ example: 3, minimum: 1, description: '调用者持有的写租约 fencing_token。' })
  @IsInt() @Min(1) fencing_token: number;

  @ApiPropertyOptional({ example: 'A1B2C3D4E5', maxLength: 16, description: '可选的 LanLink 房间码；供其他成员在 409 SQUAD_SAVE_LEASE_HELD 时一键加入。' })
  @IsOptional() @IsString() @MaxLength(16) lanlink_room_code?: string;
}

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

  @ApiPropertyOptional({
    enum: ['private', 'friends', 'public'],
    example: 'friends',
    description: '可见范围：谁能在联机大厅或好友列表中发现自己。不决定是否允许加入。',
  })
  @IsOptional() @IsEnum(['private', 'friends', 'public'])
  visibility?: 'private' | 'friends' | 'public';

  @ApiPropertyOptional({
    enum: ['invite_only', 'friends', 'public'],
    example: 'friends',
    description: '加入权限：谁有资格加入。房间码、邀请链接、大厅入口都只是入口，不是权限。',
  })
  @IsOptional() @IsEnum(['invite_only', 'friends', 'public'])
  join_policy?: 'invite_only' | 'friends' | 'public';

  @ApiPropertyOptional({
    example: false,
    description: '加入范围内仍需房主批准：开启后符合条件的用户须先发加入请求。',
  })
  @IsOptional() @IsBoolean()
  require_approval?: boolean;

  @ApiPropertyOptional({ minimum: 2, maximum: 64, example: 8, description: 'Peer 最大数量。' })
  @IsOptional() @IsInt() @Min(2) @Max(64)
  max_players?: number;

  @ApiPropertyOptional({ type: () => ModPackRefDto, description: '引用一个已发布 Pack；与 mods 互斥。' })
  @IsOptional() @ValidateNested() @Type(() => ModPackRefDto)
  mod_pack_ref?: ModPackRefDto;

  @ApiPropertyOptional({
    type: () => [SessionModDto],
    maxItems: 64,
    description: '房主本地 Mod 清单，最多 64 项；与 mod_pack_ref 互斥。',
  })
  @IsOptional() @IsArray() @ArrayMaxSize(64) @ValidateNested({ each: true }) @Type(() => SessionModDto)
  mods?: SessionModDto[];

  @ApiPropertyOptional({ type: () => SquadSaveRefDto, description: '小队共享存档接力：调用者必须是该槽位当前租约持有者；成功后回填 active_session_id。' })
  @IsOptional() @ValidateNested() @Type(() => SquadSaveRefDto)
  squad_save_ref?: SquadSaveRefDto;
}

export class ListMultiplayerSessionsDto {
  @ApiPropertyOptional({ example: 'mindustry', maxLength: 128, description: '按游戏稳定 ID 精确筛选。' })
  @IsOptional() @IsString() @MaxLength(128)
  game_id?: string;

  @ApiPropertyOptional({ example: 'v157', maxLength: 64, description: '按游戏版本精确筛选。' })
  @IsOptional() @IsString() @MaxLength(64)
  game_version?: string;

  @ApiPropertyOptional({ example: true, description: '按是否模组房筛选：true 只返回模组房，false 只返回原版房。' })
  // 全局 ValidationPipe 开启了 enableImplicitConversion，`Boolean('false')` 会先被
  // 隐式转成 true；因此必须读原始对象上的字符串值，不能只看 `value`。
  @IsOptional() @Transform(({ obj, key }) => {
    const raw = obj?.[key];
    return raw === true || raw === 'true' || raw === '1';
  })
  @IsBoolean()
  modded?: boolean;

  @ApiPropertyOptional({ example: 'flood-driver', maxLength: 191, description: '只返回房主清单包含该 Mod 的会话。' })
  @IsOptional() @IsString() @MaxLength(191)
  mod_id?: string;

  @ApiPropertyOptional({ example: 'c0ffee00-0000-4000-8000-000000000000', maxLength: 36, description: '只返回引用该公开 Pack 的会话。' })
  @IsOptional() @IsString() @MaxLength(36)
  pack_public_id?: string;

  @ApiPropertyOptional({ minimum: 1, example: 1, description: '页码，从 1 开始。' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, example: 20, description: '每页数量，最大 50。' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit?: number;
}

export class ListMultiplayerInvitesDto {
  @ApiPropertyOptional({ minimum: 1, example: 1, description: '页码，从 1 开始。' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, example: 50, description: '每页邀请数，最大 50。' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit?: number;
}

export class ListJoinRequestsDto {
  @ApiPropertyOptional({ minimum: 1, example: 1, description: '页码，从 1 开始。' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, example: 50, description: '每页加入申请数，最大 50。' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit?: number;
}

export class JoinMultiplayerSessionDto {
  @ApiPropertyOptional({ example: 'invite_opaque_id', maxLength: 128, description: '有效邀请 ID。' })
  @IsOptional() @IsString() @MaxLength(128)
  invite_id?: string;

  @ApiPropertyOptional({ example: '<RESUME_TOKEN>', maxLength: 256, description: '此前加入时签发的恢复令牌。' })
  @IsOptional() @IsString() @MaxLength(256)
  resume_token?: string;

  @ApiPropertyOptional({ example: 'ABCD1234', maxLength: 32, description: 'Session 加入码；只用于定位 Session，不代替加入权限。' })
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

  @ApiPropertyOptional({ example: 'conn_01J...', maxLength: 128, description: '当前 Agent WSS 认证尝试的稳定 connection_id。' })
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128)
  connection_id?: string;

  @ApiPropertyOptional({ example: '<RELAY_CREDENTIAL>', maxLength: 2048, description: '仅撤销尚未消费的分配时需要；Forum 会校验签名、分配 ID、Agent 与 expiry。' })
  @IsOptional() @IsString() @MaxLength(2048)
  credential?: string;
}

/** 客户端同步计划请求中的一个本地 Mod。 */
export class InstalledModDto {
  @ApiProperty({ example: 'flood-driver', maxLength: 191, description: '本地 Mod 的稳定标识。' })
  @IsString() @MinLength(1) @MaxLength(191)
  mod_id: string;

  @ApiPropertyOptional({ example: '1.2.0', maxLength: 100, description: '本地版本号。' })
  @IsOptional() @IsString() @MaxLength(100)
  version?: string;

  @ApiPropertyOptional({
    example: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    maxLength: 64,
    pattern: '^[a-fA-F0-9]{64}$',
    description: '本地文件的 SHA-256；缺失时无法确认已同步。',
  })
  @IsOptional() @IsString() @Matches(/^[a-fA-F0-9]{64}$/)
  sha256?: string;

  @ApiPropertyOptional({ example: true, description: '本地是否已启用；缺省为 true。' })
  @IsOptional() @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: false, description: '是否为纯客户端辅助 Mod（mod.hjson hidden / 白名单）；默认保留不禁用。' })
  @IsOptional() @IsBoolean()
  client_only?: boolean;
}

export class ModSyncPlanDto {
  @ApiPropertyOptional({
    type: () => [InstalledModDto],
    maxItems: 128,
    description: '客户端本地已安装 Mod 清单，最多 128 项；省略时按空清单计算（全部需要下载）。',
  })
  @IsOptional() @IsArray() @ArrayMaxSize(128) @ValidateNested({ each: true }) @Type(() => InstalledModDto)
  installed_mods?: InstalledModDto[];

  @ApiPropertyOptional({
    example: 'ABCD1234',
    maxLength: 32,
    description: '可选房间码；与 join 接口同一校验。持有有效房间码的客人可在加入前读取同步计划。',
  })
  @IsOptional() @IsString() @MaxLength(32)
  join_code?: string;
}
