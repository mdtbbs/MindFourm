import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { ApiV1 } from '../../../common/decorators/api-v1.decorator';
import { PortalService, PortalData } from '../portal.service';

@ApiV1()
@ApiTags('v1-portal')
@Controller('v1/portal')
export class PortalV1Controller {
  constructor(private readonly portalService: PortalService) {}

  @Get()
  @ApiOkResponse({ description: 'Portal homepage data' })
  getPortalData(): Promise<PortalData> {
    return this.portalService.getPortalData();
  }
}
