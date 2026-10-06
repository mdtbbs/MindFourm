import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ApiV1 } from '@common/decorators/api-v1.decorator';
import { OAuthOptionalProtected } from '@common/decorators/oauth-protected.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { ResourceDiscoveryService } from './resource-discovery.service';

@ApiV1()
@ApiExcludeController()
@Controller('v1/resources/discovery')
export class ResourceDiscoveryController {
  constructor(private readonly discovery: ResourceDiscoveryService) {}

  @Get('home')
  @OAuthOptionalProtected('resource.read')
  @RateLimit({ max: 60, window: 60 })
  home(@Query('kind') kind?: string, @Query('limit') limit?: string) {
    return this.discovery.home(kind, Number(limit));
  }

  @Get('for-you')
  @OAuthOptionalProtected('resource.read')
  @RateLimit({ max: 45, window: 60 })
  forYou(@Req() request: any, @Query('kind') kind?: string, @Query('limit') limit?: string) {
    return this.discovery.forYou(request.user?.id, kind, Number(limit));
  }

  @Get('related/:id')
  @OAuthOptionalProtected('resource.read')
  @RateLimit({ max: 60, window: 60 })
  related(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.discovery.related(id, Number(limit));
  }
}
