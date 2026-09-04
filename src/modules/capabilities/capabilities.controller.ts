import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { ApiV1 } from '../../common/decorators/api-v1.decorator';
import { CapabilitiesService, ClientCapabilities } from './capabilities.service';

@ApiV1()
@ApiTags('v1-capabilities')
@Controller('v1/capabilities')
export class CapabilitiesController {
  constructor(private readonly capabilitiesService: CapabilitiesService) {}

  @Get()
  @ApiOkResponse({ description: 'Current first-party API capabilities' })
  getCapabilities(): Promise<ClientCapabilities> {
    return this.capabilitiesService.getCapabilities();
  }
}
