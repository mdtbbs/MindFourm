import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../common/decorators/api-v1.decorator';
import { CapabilitiesService } from './capabilities.service';

@ApiV1()
@ApiTags('v1-client')
@Controller('v1/client')
export class ClientConfigV1Controller {
  constructor(private readonly capabilities: CapabilitiesService) {}
  @Get('config')
  @ApiQuery({ name: 'platform', required: false, type: String, example: 'android', description: '客户端平台标识。' })
  @ApiQuery({ name: 'version_code', required: false, type: Number, example: 100, description: '当前已安装客户端版本号。' })
  config(@Query('platform') platform?: string, @Query('version_code') versionCode?: string) {
    return this.capabilities.getAndroidClientConfig(platform, Number(versionCode || 0));
  }
}
