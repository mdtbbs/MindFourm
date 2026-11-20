import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GameSaveDisplayMetadataDto, GameSaveGameMetadataDto, GameSaveManifestDto, GameSaveModDto } from '../../game-saves/dto/game-saves.dto';

const SAVE_REASONS = ['manual', 'before_launch', 'after_exit', 'periodic', 'restore', 'conflict', 'import'] as const;

export class CreateSquadDto {
  @ApiProperty({ example: '周末联机小队', maxLength: 80, description: '小队名称。' })
  @IsString() @MaxLength(80) name: string;
}

export class PatchSquadDto {
  @ApiProperty({ example: '新小队名', maxLength: 80, description: '新的小队名称。' })
  @IsString() @MaxLength(80) name: string;
}

export class InviteSquadMemberDto {
  @ApiProperty({ example: 123, minimum: 1, description: '被邀请好友的用户 ID；仅限已是好友的账号。' })
  @IsInt() @Min(1) user_id: number;
}

export class PatchSquadMemberDto {
  @ApiProperty({ enum: ['admin', 'member'], example: 'admin', description: '成员角色；队长由两步转让单独切换。' })
  @IsIn(['admin', 'member']) role: 'admin' | 'member';
}

export class CreateSquadOwnershipTransferDto {
  @ApiProperty({ example: 123, minimum: 1, description: '目标小队成员的用户 ID。' })
  @IsInt() @Min(1) target_user_id: number;
}

export class CreateSquadSlotDto {
  @ApiProperty({ example: '主世界', maxLength: 100, description: '共享存档槽名称。' })
  @IsString() @MaxLength(100) name: string;
  @ApiPropertyOptional({ example: 'v160.7', maxLength: 64, description: '存档依赖的游戏版本。' })
  @IsOptional() @IsString() @MaxLength(64) game_version?: string;
  @ApiPropertyOptional({ type: () => [GameSaveModDto], maxItems: 100, description: '存档依赖的 Mod 摘要；接力开房前用于唤起模组同步。' })
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => GameSaveModDto) mods?: GameSaveModDto[];
}

export class PatchSquadSlotDto {
  @ApiProperty({ example: '新槽位名', maxLength: 100, description: '新的存档槽名称。' })
  @IsString() @MaxLength(100) name: string;
}

export class AcquireSquadSaveLeaseDto {
  @ApiPropertyOptional({ example: false, description: '目标槽位被未过期的其他房主持有时，owner/admin 可确认强制接管。' })
  @IsOptional() @IsBoolean() force_takeover?: boolean;
}

export class RenewSquadSaveLeaseDto {
  @ApiProperty({ example: 3, minimum: 1, description: '当前持有的 fencing_token；不匹配说明租约已被他人接管。' })
  @IsInt() @Min(1) fencing_token: number;
}

export class ReleaseSquadSaveLeaseDto {
  @ApiPropertyOptional({ example: 3, minimum: 1, description: '可选 fencing_token；提供时必须是当前值，否则拒绝释放。' })
  @IsOptional() @IsInt() @Min(1) fencing_token?: number;
}

export class CheckSquadSaveBlobsDto {
  @ApiProperty({ type: [String], maxItems: 5000, example: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'], description: '待查询的 SHA-256；查询范围严格限定在当前小队。' })
  @IsArray() @ArrayMaxSize(5000) @Matches(/^[a-f0-9]{64}$/, { each: true }) sha256: string[];
}

export class CreateSquadSaveBlobUploadDto {
  @ApiProperty({ pattern: '^[a-f0-9]{64}$', example: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', description: '单个文件内容的 SHA-256。' })
  @Matches(/^[a-f0-9]{64}$/) sha256: string;
  @ApiProperty({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER, example: 4194304, description: '单个文件字节数。' })
  @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) size: number;
}

export class CommitSquadSaveSnapshotDto {
  @ApiProperty({ example: 3, minimum: 1, description: '租约 fencing_token；只有当前持有者才能推进主链。' })
  @IsInt() @Min(1) fencing_token: number;
  @ApiPropertyOptional({ enum: ['normal', 'conflict_rescue'], example: 'normal', description: 'conflict_rescue 将旧房主的过期提交保存为 conflict 分支，不推进主链。' })
  @IsOptional() @IsIn(['normal', 'conflict_rescue']) mode?: 'normal' | 'conflict_rescue';
  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: '本次提交基于的主链快照；与当前 head 不一致时返回 SQUAD_SAVE_CONFLICT。' })
  @IsOptional() @IsUUID('4') base_snapshot_id?: string | null;
  @ApiProperty({ type: () => GameSaveManifestDto, description: '本次快照的完整文件清单。' })
  @ValidateNested() @Type(() => GameSaveManifestDto) manifest: GameSaveManifestDto;
  @ApiPropertyOptional({ enum: [...SAVE_REASONS], example: 'manual', description: '保存原因。' })
  @IsOptional() @IsIn(SAVE_REASONS) reason?: typeof SAVE_REASONS[number];
  @ApiPropertyOptional({ type: () => GameSaveGameMetadataDto, description: '游戏版本信息。' })
  @IsOptional() @ValidateNested() @Type(() => GameSaveGameMetadataDto) game?: GameSaveGameMetadataDto;
  @ApiPropertyOptional({ type: () => GameSaveDisplayMetadataDto, description: '游戏内存档显示信息。' })
  @IsOptional() @ValidateNested() @Type(() => GameSaveDisplayMetadataDto) save?: GameSaveDisplayMetadataDto;
  @ApiPropertyOptional({ type: () => [GameSaveModDto], maxItems: 100, description: '该存档使用的 Mod 列表。' })
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => GameSaveModDto) mods?: GameSaveModDto[];
  @ApiPropertyOptional({ maxLength: 128, example: 'desktop-main', description: '客户端设备标识。' })
  @IsOptional() @IsString() @MaxLength(128) device_id?: string;
}

export class RestoreSquadSaveSnapshotDto {
  @ApiProperty({ example: 3, minimum: 1, description: '当前租约 fencing_token；恢复会创建新的主链快照。' })
  @IsInt() @Min(1) fencing_token: number;
  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: '确认当前 head；变化时拒绝恢复，避免覆盖他人新存档。' })
  @IsOptional() @IsUUID('4') confirm_head_snapshot_id?: string | null;
}

export class PatchSquadSaveSnapshotDto {
  @ApiProperty({ example: true, description: '置顶后该快照不参与 GFS 自动裁剪；每个槽最多 10 个。' })
  @IsBoolean() pinned: boolean;
}

export class SquadSaveBlobDownloadGrantDto {
  @ApiProperty({ type: [String], maxItems: 5000, example: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'], description: '要下载的 SHA-256；必须属于该快照清单。' })
  @IsArray() @ArrayMaxSize(5000) @Matches(/^[a-f0-9]{64}$/, { each: true }) sha256: string[];
}
