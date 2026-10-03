import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../common/decorators/api-v1.decorator';
import { OAuthProtected } from '../../common/decorators/oauth-protected.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { PacksService } from './packs.service';

@ApiV1()
@ApiTags('v1-resource-pack-items')
@Controller('v1/resources')
export class PackItemsController {
  constructor(private readonly packs: PacksService) {}

  @Get(':packId/versions/:versionId/pack-items')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 30, window: 60 })
  @ApiOperation({ operationId: 'listPackVersionItems', summary: 'List a Pack version’s fixed resource-version membership' })
  @ApiParam({ name: 'packId', type: 'string' })
  @ApiParam({ name: 'versionId', type: 'string' })
  @ApiOkResponse({ description: 'Owner-only ordered Pack items.' })
  async listItems(@Param('packId') packId: string, @Param('versionId') versionId: string, @Req() req: any) {
    return this.packs.listItems(packId, versionId, Number(req.user.id));
  }

  @Put(':packId/versions/:versionId/pack-items')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({ operationId: 'replacePackVersionItems', summary: 'Replace a Pack version’s fixed resource-version membership' })
  @ApiParam({ name: 'packId', type: 'string' })
  @ApiParam({ name: 'versionId', type: 'string' })
  @ApiBody({ schema: {
    type: 'object', required: ['items'], properties: {
      items: { type: 'array', maxItems: 100, items: { type: 'object', required: ['resource_version_public_id'], properties: {
        resource_version_public_id: { type: 'string', format: 'uuid', description: 'Public ID of an exact published member version; floating latest references are not accepted.' },
      } } },
    },
  } })
  @ApiOkResponse({ description: 'The replacement ordered Pack membership.' })
  async replaceItems(
    @Param('packId') packId: string,
    @Param('versionId') versionId: string,
    @Body() body: { items?: unknown },
    @Req() req: any,
  ) {
    return this.packs.replaceItems(packId, versionId, Number(req.user.id), body?.items as any);
  }
}
