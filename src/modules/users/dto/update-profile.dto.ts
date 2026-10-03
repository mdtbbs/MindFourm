import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @ApiPropertyOptional({ maxLength: 30, example: 'builder', description: '新用户名，最多 30 个字符。' })
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiPropertyOptional({ maxLength: 500, example: 'Mindustry 玩家', description: '个人简介，最多 500 个字符。' })
  bio?: string;

  @IsOptional()
  @IsString()
  @IsIn(['zh-CN', 'en', 'ru', 'ja'])
  @ApiPropertyOptional({ enum: ['zh-CN', 'en', 'ru', 'ja'], example: 'zh-CN', description: '界面语言偏好。' })
  preferred_locale?: string;

  @IsOptional()
  @IsString()
  @IsIn(['zh-CN', 'en', 'ru', 'ja'])
  @ApiPropertyOptional({ enum: ['zh-CN', 'en', 'ru', 'ja'], nullable: true, example: 'en', description: '内容信息流语言偏好；null 表示不指定。' })
  preferred_content_language?: string | null;
}
