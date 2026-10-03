import { Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../common/decorators/api-v1.decorator';
import { OAuthOptionalProtected } from '../../common/decorators/oauth-protected.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { PacksService } from './packs.service';
import { packDownloadGrantsSchema, packManifestSchema } from './packs.dto';

@ApiV1()
@ApiTags('v1-packs')
@Controller('v1/packs')
export class PacksController {
  constructor(private readonly packs: PacksService) {}

  @Get(':packId/versions/:versionId/manifest')
  @OAuthOptionalProtected('resource.read')
  @RateLimit({ max: 60, window: 60 })
  @ApiOperation({ operationId: 'getPackVersionManifest', summary: 'Get a deterministic manifest for one published Pack version' })
  @ApiParam({ name: 'packId', type: 'string' })
  @ApiParam({ name: 'versionId', type: 'string' })
  @ApiOkResponse({ description: 'Pack manifest with fixed published member versions and stable file download URLs.', schema: packManifestSchema })
  async getManifest(@Param('packId') packId: string, @Param('versionId') versionId: string) {
    return this.packs.getManifest(packId, versionId);
  }

  @Post(':packId/versions/:versionId/download-grants')
  @HttpCode(HttpStatus.OK)
  @OAuthOptionalProtected('resource.download')
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({ operationId: 'createPackVersionDownloadGrants', summary: 'Issue a batch of download grants for the Pack pinned files' })
  @ApiParam({ name: 'packId', type: 'string' })
  @ApiParam({ name: 'versionId', type: 'string' })
  @ApiOkResponse({ description: 'One grant result and stable download URL for each exact file pinned by the Pack version.', schema: packDownloadGrantsSchema })
  async createDownloadGrants(@Param('packId') packId: string, @Param('versionId') versionId: string, @Req() req: any) {
    return this.packs.createDownloadGrants(packId, versionId, req);
  }
}
