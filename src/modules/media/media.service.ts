import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaAsset } from '@entities/media-asset.entity';
import { ResourceMediaLink } from '@entities/resource-media-link.entity';
import { randomUUID } from 'crypto';

/**
 * Media Service — manages display media (cover images, screenshots).
 *
 * This is separate from ResourceFile which manages downloadable content.
 * Media assets are presentation-layer; they share storage infrastructure
 * but have different lifecycle and access patterns.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @InjectRepository(MediaAsset)
    private readonly mediaAssetRepo: Repository<MediaAsset>,
    @InjectRepository(ResourceMediaLink)
    private readonly mediaLinkRepo: Repository<ResourceMediaLink>,
  ) {}

  /**
   * Get media assets linked to a resource, ordered by sort_order.
   */
  async getResourceMedia(resourceId: number): Promise<MediaAsset[]> {
    const links = await this.mediaLinkRepo.find({
      where: { resource_id: resourceId },
      order: { sort_order: 'ASC' },
      relations: ['media_asset'],
    });

    return links.map(link => link.media_asset);
  }

  /**
   * Get the cover image for a resource, if one exists.
   */
  async getResourceCover(resourceId: number): Promise<MediaAsset | null> {
    const link = await this.mediaLinkRepo.findOne({
      where: { resource_id: resourceId, role: 'cover' },
      relations: ['media_asset'],
    });

    return link?.media_asset ?? null;
  }

  /**
   * Create a media asset record and link it to a resource.
   */
  async createAndLink(params: {
    resourceId: number;
    mediaType: string;
    role: string;
    storageBackend: string;
    storageKey: string | null;
    url: string | null;
    originalFilename: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
  }): Promise<MediaAsset> {
    const asset: MediaAsset = {
      public_id: randomUUID(),
      media_type: params.mediaType,
      storage_backend: params.storageBackend,
      storage_key: params.storageKey,
      url: params.url,
      original_filename: params.originalFilename,
      mime_type: params.mimeType,
      size_bytes: params.sizeBytes,
      status: 'active',
    } as MediaAsset;

    const savedAsset = await this.mediaAssetRepo.save(asset);

    const link: ResourceMediaLink = {
      resource_id: params.resourceId,
      media_asset_id: savedAsset.id,
      role: params.role,
      sort_order: 0,
    } as ResourceMediaLink;

    await this.mediaLinkRepo.save(link);

    return savedAsset;
  }
}
