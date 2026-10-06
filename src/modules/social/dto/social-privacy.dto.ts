import { IsBoolean, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const VISIBILITY = ['everyone', 'friends', 'nobody'] as const;
const PRESENCE_STATUS = ['online', 'idle', 'dnd', 'invisible'] as const;

export class PatchSocialPrivacyDto {
  @ApiPropertyOptional({ enum: [...PRESENCE_STATUS], example: 'online', description: '好友看到的在线状态。' })
  @IsOptional() @IsEnum(PRESENCE_STATUS)
  status?: typeof PRESENCE_STATUS[number];

  @ApiPropertyOptional({ enum: [...VISIBILITY], example: 'friends', description: '谁可以看到在线状态。' })
  @IsOptional() @IsEnum(VISIBILITY)
  presence_visibility?: typeof VISIBILITY[number];

  @ApiPropertyOptional({ enum: [...VISIBILITY], example: 'friends', description: '谁可以看到 Rich Activity。' })
  @IsOptional() @IsEnum(VISIBILITY)
  activity_visibility?: typeof VISIBILITY[number];

  @ApiPropertyOptional({ enum: [...VISIBILITY], example: 'friends', description: '谁可以通过公开 Join Intent 加入。' })
  @IsOptional() @IsEnum(VISIBILITY)
  allow_join?: typeof VISIBILITY[number];

  @ApiPropertyOptional({ enum: [...VISIBILITY], example: 'friends', description: '谁可以向你发送加入请求。' })
  @IsOptional() @IsEnum(VISIBILITY)
  allow_join_request?: typeof VISIBILITY[number];

  @ApiPropertyOptional({ enum: [...VISIBILITY], example: 'friends', description: '谁可以向你发送多人游戏邀请。' })
  @IsOptional() @IsEnum(VISIBILITY)
  allow_invites?: typeof VISIBILITY[number];

  @ApiPropertyOptional({ enum: [...VISIBILITY], example: 'everyone', description: '谁可以向你发送私信；默认允许所有人，屏蔽关系始终优先。' })
  @IsOptional() @IsEnum(VISIBILITY)
  allow_messages?: typeof VISIBILITY[number];

  @ApiPropertyOptional({ example: true, description: '是否向有权限的好友显示上次在线时间。' })
  @IsOptional() @IsBoolean()
  show_last_seen?: boolean;
}

export class CreateFriendRequestDto {
  @ApiProperty({ minimum: 1, example: 123, description: '要添加的论坛用户 ID。' })
  @IsInt()
  @Min(1)
  target_user_id: number;
}
