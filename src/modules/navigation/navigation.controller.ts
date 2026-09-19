import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '@common/decorators/api-v1.decorator';
import { Public } from '@common/decorators/public.decorator';
import { NavigationService } from './navigation.service';

@ApiV1()
@ApiTags('v1-navigation')
@Public()
@Controller('v1/navigation')
export class NavigationController {
  constructor(private readonly navigationService: NavigationService) {}

  @Get()
  getPublicNavigation() {
    return this.navigationService.getPublicSnapshot();
  }
}
