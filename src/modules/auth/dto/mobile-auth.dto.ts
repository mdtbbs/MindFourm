import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MobileExchangeDto {
  @ApiProperty({ example: '<AUTHORIZATION_CODE>', description: 'MindAuth 返回的一次性原生授权码。' })
  @IsString() @IsNotEmpty() code: string;
  @ApiProperty({ example: '<PKCE_CODE_VERIFIER>', description: '发起授权时生成的 PKCE verifier。' })
  @IsString() @IsNotEmpty() code_verifier: string;
  // Native authorization codes are not browser OAuth codes; this legacy
  // client field is accepted for wire compatibility but is never trusted.
  @ApiPropertyOptional({ maxLength: 2048, description: '旧客户端兼容字段；服务端不会信任或使用此值。' })
  @IsOptional() @IsString() @MaxLength(2048) redirect_uri?: string;
  @ApiProperty({ maxLength: 128, example: 'Android Tablet', description: '此设备的显示名称。' })
  @IsString() @IsNotEmpty() @MaxLength(128) device_name: string;
}
export class MobileRefreshDto {
  @ApiProperty({ example: '<CURRENT_REFRESH_TOKEN>', description: '当前有效的 Forum refresh token；成功后会轮换。' })
  @IsString() @IsNotEmpty() refresh_token: string;
}
export class MobileLogoutDto {
  @ApiProperty({ format: 'uuid', example: '00000000-0000-4000-8000-000000000001', description: '要注销的移动端会话 ID。' })
  @IsUUID() session_id: string;
}
