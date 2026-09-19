import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '@common/decorators/api-v1.decorator';
import { Public } from '@common/decorators/public.decorator';
import { GameVersionService } from './game-version.service';

@ApiV1()
@ApiTags('v1-game-versions')
@Public()
@Controller('v1/game-versions')
export class GameVersionsController {
  constructor(private readonly versions: GameVersionService) {}

  @Get()
  list(@Query('channel') channel?: string) {
    return this.versions.listVersions(channel);
  }

  @Get('latest')
  latestStable() {
    return this.versions.getLatestStable();
  }
}
