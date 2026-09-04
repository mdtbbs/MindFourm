import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../common/decorators/api-v1.decorator';
import { CapabilitiesService } from './capabilities.service';

@ApiV1()
@ApiTags('v1-client')
@Controller('v1/client')
export class ClientConfigV1Controller {
  constructor(private readonly capabilities: CapabilitiesService) {}
  @Get('config') config(@Query('platform') platform?: string, @Query('version_code') versionCode?: string) {
    return this.capabilities.getAndroidClientConfig(platform, Number(versionCode || 0));
  }
}
