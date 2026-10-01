import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID,
  Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const SAVE_REASONS = ['manual', 'before_launch', 'after_exit', 'periodic', 'restore', 'conflict', 'import'] as const;

export class CreateGameSaveSlotDto {
  @ApiProperty({ example: '生存档', maxLength: 100, description: '云存档槽位名称。' })
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
}

export class PatchGameSaveSlotDto {
  @ApiProperty({ example: '新名称', maxLength: 100, description: '新的云存档槽位名称。' })
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
}

export class GameSaveGameMetadataDto {
  @ApiPropertyOptional({ example: 'v157', maxLength: 32, description: 'Mindustry 游戏版本。' })
  @IsOptional() @IsString() @MaxLength(32) version?: string;
  @ApiPropertyOptional({ minimum: 0, maximum: 2147483647, example: 157, description: '游戏构建号。' })
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) build?: number;
}

export class GameSaveDisplayMetadataDto {
  @ApiPropertyOptional({ example: 'Salt Flats', maxLength: 160, description: '存档中的地图名称。' })
  @IsOptional() @IsString() @MaxLength(160) map_name?: string;
  @ApiPropertyOptional({ minimum: 0, example: 120, description: '当前波次。' })
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) wave?: number;
  @ApiPropertyOptional({ minimum: 0, example: 3600, description: '累计游玩秒数。' })
  @IsOptional() @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER) playtime_seconds?: number;
}

export class GameSaveModDto {
  @ApiPropertyOptional({ example: 'example-mod', maxLength: 100, description: 'Mod 稳定标识。' })
  @IsOptional() @IsString() @MaxLength(100) id?: string;
  @ApiPropertyOptional({ example: 'Example Mod', maxLength: 160, description: 'Mod 显示名称。' })
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @ApiPropertyOptional({ example: '1.2.0', maxLength: 64, description: 'Mod 版本。' })
  @IsOptional() @IsString() @MaxLength(64) version?: string;
  @ApiPropertyOptional({ pattern: '^[a-f0-9]{64}$', example: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', description: 'Mod 文件 SHA-256 小写十六进制值。' })
  @IsOptional() @Matches(/^[a-f0-9]{64}$/) sha256?: string;
}

export class CreateGameSaveUploadDto {
  @ApiProperty({ pattern: '^[a-f0-9]{64}$', example: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', description: '存档文件 SHA-256 小写十六进制值。' })
  @Matches(/^[a-f0-9]{64}$/) sha256: string;
  @ApiProperty({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER, example: 1048576, description: '存档文件字节数。' })
  @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) size: number;
  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: '基于此快照进行增量上传；首次上传时省略。' })
  @IsOptional() @IsUUID('4') base_snapshot_id?: string | null;
  @ApiPropertyOptional({ enum: [...SAVE_REASONS], example: 'manual', description: '保存原因。' })
  @IsOptional() @IsIn(SAVE_REASONS) reason?: typeof SAVE_REASONS[number];
  @ApiPropertyOptional({ enum: ['normal', 'create_conflict_copy', 'force_replace_head'], example: 'normal', description: '发生并发冲突时的处理策略。' })
  @IsOptional() @IsIn(['normal', 'create_conflict_copy', 'force_replace_head']) conflict_resolution?: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: '确认当前最新快照 ID；用于避免覆盖期间发生变化。' })
  @IsOptional() @IsUUID('4') confirm_current_snapshot_id?: string | null;
  @ApiPropertyOptional({ type: () => GameSaveGameMetadataDto, description: '游戏版本信息。' })
  @IsOptional() @ValidateNested() @Type(() => GameSaveGameMetadataDto) game?: GameSaveGameMetadataDto;
  @ApiPropertyOptional({ type: () => GameSaveDisplayMetadataDto, description: '游戏内存档显示信息。' })
  @IsOptional() @ValidateNested() @Type(() => GameSaveDisplayMetadataDto) save?: GameSaveDisplayMetadataDto;
  @ApiPropertyOptional({ type: () => [GameSaveModDto], maxItems: 100, description: '该存档使用的 Mod 列表，最多 100 项。' })
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => GameSaveModDto) mods?: GameSaveModDto[];
  @ApiPropertyOptional({ maxLength: 128, example: 'desktop-main', description: '客户端设备标识。' })
  @IsOptional() @IsString() @MaxLength(128) device_id?: string;
}

export class RestoreGameSaveDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: '确认当前快照 ID；若最新版本已变化，服务端会拒绝覆盖。' })
  @IsOptional() @IsUUID('4') confirm_current_snapshot_id?: string | null;
}

export class PatchGameSaveSnapshotDto {
  @ApiProperty({ example: true, description: '是否固定此历史快照，固定后不会自动清理。' })
  @IsBoolean() pinned: boolean;
}

export class GameSaveListQueryDto {
  @ApiPropertyOptional({ maxLength: 300, example: 'CURSOR_FROM_PREVIOUS_PAGE', description: '上页响应 meta.next_cursor 返回的不透明游标。' })
  @IsOptional() @IsString() @MaxLength(300) cursor?: string;
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 30, example: 30, description: '每页返回数量。' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 30;
}
