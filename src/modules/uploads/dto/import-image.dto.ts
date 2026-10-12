import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl, MaxLength } from 'class-validator';

export class ImportImageDto {
  @ApiProperty({ description: '要导入的公开 HTTP(S) 图片地址', maxLength: 4096 })
  @IsString()
  @MaxLength(4096)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  url: string;
}
