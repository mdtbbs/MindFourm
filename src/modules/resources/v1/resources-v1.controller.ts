import { Controller, Get, Param, HttpStatus, Query, Res, StreamableFile, NotFoundException, Optional } from '@nestjs/common';
import { Response } from 'express';
import { createReadStream } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ApiTags, ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { ApiV1, RawHttpResponse } from '../../../common/decorators/api-v1.decorator';
import { ApiV1Exception } from '../../../common/exceptions/api-v1.exception';
import { OptionalAuth } from '../../../common/decorators/public.decorator';
import { RateLimit } from '../../../common/decorators/rate-limit.decorator';
import { assertSafeRedirectUrl } from '../../../common/utils/safe-url.util';
import { attachmentContentDisposition } from '../../../common/utils/content-disposition.util';
import { OAuthOptionalProtected } from '../../../common/decorators/oauth-protected.decorator';
import { ResourcePreviewService } from '../resource-preview.service';
import { CapabilitiesService } from '../../capabilities/capabilities.service';
import { ResourceReadAdapterService, V1ResourceDto } from '../resource-read-adapter.service';
import { V1ResourceDetail, V1ResourceManifest } from './resources-v1.dto';

/**
 * V1 Resource read endpoints.
 *
 * These endpoints use the V1 transport contract ({ data, meta } envelope)
 * and are gated by the `feature_resources_v1_read_enabled` Settings flag.
 * When the flag is off, requests return a RESOURCE_V1_DISABLED error.
 *
 * Public clients resolve resources by public_id. Numeric database IDs are not
 * part of the external contract.
 */
@ApiV1()
@ApiTags('v1-resources')
@Controller('v1/resources')
export class ResourcesV1Controller {
  constructor(
    private readonly capabilitiesService: CapabilitiesService,
    private readonly resourceReadAdapter: ResourceReadAdapterService,
    @Optional() private readonly resourcePreviewService?: ResourcePreviewService,
  ) {}

  @Get()
  @OptionalAuth()
  @OAuthOptionalProtected('resource.read')
  @ApiOkResponse({ description: 'Public resource list' })
  async listResources(@Query('limit') limit?: string, @Query('offset') offset?: string, @Query('q') query?: string) {
    await this.assertEnabled();
    return this.resourceReadAdapter.listResourcesV1({ limit: Number(limit) || 20, offset: Number(offset) || 0, search: query });
  }

  @Get(':id/manifest')
  @OptionalAuth()
  @OAuthOptionalProtected('resource.read')
  @ApiParam({ name: 'id', type: 'string' })
  @ApiOkResponse({ description: 'Launcher and in-game resource manifest' })
  async getManifest(@Param('id') id: string): Promise<V1ResourceManifest> {
    await this.assertEnabled();
    const manifest = await this.resourceReadAdapter.getManifestByPublicId(id);
    if (!manifest) throw new ApiV1Exception('RESOURCE_NOT_FOUND', HttpStatus.NOT_FOUND, '资源不存在或不可见', false);
    return manifest;
  }

  @Get(':id/preview')
  @RawHttpResponse()
  @OptionalAuth()
  @OAuthOptionalProtected('resource.read')
  async getPreview(@Param('id') id: string, @Res() res: Response) {
    await this.assertEnabled();
    const resource = await this.resourceReadAdapter.getPublicResourceEntityByPublicId(id);
    const preview = resource && this.resourcePreviewService ? await this.resourcePreviewService.readPreview(resource) : null;
    if (!preview) throw new NotFoundException('预览尚未生成');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.send(preview);
  }

  @Get(':resourceId/versions/:versionId/files/:fileId/download')
  @RawHttpResponse()
  @OptionalAuth()
  @OAuthOptionalProtected('resource.download')
  @RateLimit({ max: 60, window: 60 })
  async downloadFile(
    @Param('resourceId') resourceId: string,
    @Param('versionId') versionId: string,
    @Param('fileId') fileId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.assertEnabled();
    const caps = await this.capabilitiesService.getCapabilities();
    if (!caps.resources.download) throw new ApiV1Exception('FEATURE_DISABLED', HttpStatus.FORBIDDEN, '站点已关闭资源下载', false);
    const target = await this.resourceReadAdapter.getPublicFileByPublicIds(resourceId, versionId, fileId);
    if (!target || target.file.availability_status !== 'available') {
      throw new NotFoundException('文件不存在或暂不可用');
    }

    const redirectUrl = target.file.external_url || (
      ['external', 'mfl'].includes(target.file.delivery_mode) && target.file.storage_key?.startsWith('http')
        ? target.file.storage_key
        : null
    );
    if (redirectUrl) {
      assertSafeRedirectUrl(redirectUrl);
      await this.resourceReadAdapter.incrementDownload(target.resource.id);
      return res.redirect(redirectUrl);
    }

    if (!target.file.storage_key) throw new NotFoundException('文件存储地址不存在');
    const filePath = path.resolve(target.file.storage_key);
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException('文件不存在');
    }
    await this.resourceReadAdapter.incrementDownload(target.resource.id);
    res.set({
      'Content-Type': target.file.mime_type || 'application/octet-stream',
      'Content-Disposition': attachmentContentDisposition(target.file.original_filename || target.file.display_name || 'file'),
    });
    return new StreamableFile(createReadStream(filePath));
  }

  @Get(':id')
  @OptionalAuth()
  @OAuthOptionalProtected('resource.read')
  @ApiParam({ name: 'id', type: 'string' })
  @ApiOkResponse({ description: 'Resource detail' })
  async getResource(@Param('id') id: string): Promise<V1ResourceDetail> {
    await this.assertEnabled();

    const resource = await this.resourceReadAdapter.getResourceByPublicId(id);
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
      public_id: dto.public_id || '',
      title: dto.title,
      summary: dto.summary,
      content: dto.content,
      content_format: 'tiptap_json',
      content_json: dto.content_json,
      content_html: dto.content_html,
      content_text: dto.content_text,
      resource_kind: dto.resource_kind || 'other',
      visibility: dto.visibility,
      metadata: dto.metadata,
      latest_version: dto.latest_version ? {
        public_id: dto.latest_version.public_id || '',
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
