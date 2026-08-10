import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { ApiV1 } from '../../../common/decorators/api-v1.decorator';
import { DiscoverService, DiscoverSummary } from '../discover.service';

@ApiV1()
@ApiTags('v1-discover')
@Controller('v1/discover')
export class DiscoverV1Controller {
  constructor(private readonly discoverService: DiscoverService) {}

  @Get()
  @ApiOkResponse({ description: 'Discovery summary' })
  getSummary(): Promise<DiscoverSummary> {
    return this.discoverService.getDiscoverSummary();
  }
}
