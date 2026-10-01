import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class CreatePresenceConnectionDto {
  @IsEnum(['web', 'launcher', 'lanlink', 'mindustry_mod', 'android'])
  platform: 'web' | 'launcher' | 'lanlink' | 'mindustry_mod' | 'android';

  @IsOptional() @IsEnum(['online', 'idle', 'dnd', 'invisible'])
  status?: 'online' | 'idle' | 'dnd' | 'invisible';
}

export class PatchPresenceConnectionDto {
  @IsOptional() @IsEnum(['online', 'idle', 'dnd', 'invisible'])
  status?: 'online' | 'idle' | 'dnd' | 'invisible';
}

export class RichActivityGameDto {
  @IsString() @MaxLength(128)
  id: string;

  @IsOptional() @IsString() @MaxLength(64)
  version?: string;
}

export class RichActivityPartyDto {
  @IsOptional() @IsInt() @Min(0) @Max(10000)
  current?: number;

  @IsOptional() @IsInt() @Min(0) @Max(10000)
  max?: number;
}

export class RichActivityTimestampDto {
  @IsOptional() @IsInt() @Min(0)
  started_at?: number;
}

export class RichActivityJoinDto {
  @IsOptional() @IsString() @MaxLength(48)
  session_id?: string;
}

export class PutRichActivityDto {
  @IsEnum(['playing', 'hosting', 'editing', 'browsing', 'downloading', 'uploading', 'launcher', 'custom'])
  type: 'playing' | 'hosting' | 'editing' | 'browsing' | 'downloading' | 'uploading' | 'launcher' | 'custom';

  @IsString() @MaxLength(160)
  name: string;

  @IsOptional() @IsString() @MaxLength(300)
  details?: string;

  @IsOptional() @IsString() @MaxLength(300)
  state?: string;

  @IsOptional() @ValidateNested() @Type(() => RichActivityGameDto)
  game?: RichActivityGameDto;

  @IsOptional() @ValidateNested() @Type(() => RichActivityPartyDto)
  party?: RichActivityPartyDto;

  @IsOptional() @ValidateNested() @Type(() => RichActivityTimestampDto)
  timestamps?: RichActivityTimestampDto;

  @IsOptional() @ValidateNested() @Type(() => RichActivityJoinDto)
  join?: RichActivityJoinDto;
}

export class FriendPresenceQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit?: number;
}
