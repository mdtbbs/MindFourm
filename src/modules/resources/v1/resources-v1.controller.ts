import { Controller, Get, Param, ParseIntPipe, HttpStatus, Query } from '@nestjs/common';
import { ApiTags, ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { ApiV1 } from '../../../common/decorators/api-v1.decorator';
import { ApiV1Exception } from '../../../common/exceptions/api-v1.exception';
import { CapabilitiesService } from '../../capabilities/capabilities.service';
import { ResourceReadAdapterService, V1ResourceDto } from '../resource-read-adapter.service';
import { V1ResourceDetail, V1VersionSummary, V1AttributionSummary } from './resources-v1.dto';

/**
 * V1 Resource read endpoints.
 *
 * These endpoints use the V1 transport contract ({ data, meta } envelope)
 * and are gated by the `feature_resources_v1_read_enabled` Settings flag.
 * When the flag is off, requests return a RESOURCE_V1_DISABLED error.
 *
 * Currently accepts integer resource IDs. A future task will add public_id
 * resolution once the backfill populates the public_id columns.
 */
@ApiV1()
@ApiTags('v1-resources')
@Controller('v1/resources')
export class ResourcesV1Controller {
  constructor(
    private readonly capabilitiesService: CapabilitiesService,
    private readonly resourceReadAdapter: ResourceReadAdapterService,
  ) {}

  @Get()
  @ApiOkResponse({ description: 'Public resource list' })
  async listResources(@Query('limit') limit?: string, @Query('offset') offset?: string, @Query('q') query?: string) {
    await this.assertEnabled();
    return this.resourceReadAdapter.listResourcesV1({ limit: Number(limit) || 20, offset: Number(offset) || 0, search: query });
  }

  @Get(':id')
  @ApiParam({ name: 'id', type: 'number' })
  @ApiOkResponse({ description: 'Resource detail' })
  async getResource(@Param('id', new ParseIntPipe()) id: number): Promise<V1ResourceDetail> {
    await this.assertEnabled();

    const resource = await this.resourceReadAdapter.getResourceV1(id);
    if (!resource) {
      throw new ApiV1Exception(
        'RESOURCE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
        '资源不存在或不可见',
        false,
      );
    }

    return this.toDetailDto(resource);
  }

  private async assertEnabled(): Promise<void> {
    const caps = await this.capabilitiesService.getCapabilities();
    if (!caps.resource_read) throw new ApiV1Exception('RESOURCE_V1_DISABLED', HttpStatus.FORBIDDEN, 'V1 资源接口暂未启用', false);
  }

  private toDetailDto(dto: V1ResourceDto): V1ResourceDetail {
    return {
      public_id: dto.public_id,
      id: dto.id,
      title: dto.title,
      summary: dto.summary,
      resource_kind: dto.resource_kind,
      visibility: dto.visibility,
      latest_version: dto.latest_version ? {
        public_id: dto.latest_version.public_id,
        id: dto.latest_version.id,
        version: dto.latest_version.version,
        display_version: dto.latest_version.display_version,
        status: dto.latest_version.status,
        is_legacy_root_release: dto.latest_version.is_legacy_root_release,
        file_count: dto.latest_version.files.length,
      } : null,
      attributions: dto.attributions.map(a => ({
        id: a.id,
        role: a.role,
        subject_type: a.subject_type,
        display_name: a.display_name,
      })),
      download_count: dto.download_count,
    };
  }
}
