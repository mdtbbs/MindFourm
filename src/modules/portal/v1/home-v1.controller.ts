import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '@common/decorators/api-v1.decorator';
import { Public } from '@common/decorators/public.decorator';
import { PortalService, HomeData } from '../portal.service';

/** Public, fault-isolated aggregate for the web homepage. */
@ApiV1()
@ApiTags('v1-home')
@Public()
@Controller('v1/home')
export class HomeV1Controller {
  constructor(private readonly portalService: PortalService) {}

  @Get()
  @ApiOkResponse({ description: 'Fault-isolated homepage data' })
  getHomeData(): Promise<HomeData> {
    return this.portalService.getHomeData();
  }
}
