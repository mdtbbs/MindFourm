import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Like, LessThan, In } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceCategory } from '@entities/resource-category.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { User } from '@entities/user.entity';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { QueryResourcesDto } from './dto/query-resources.dto';
import { parseMarkdown } from '@common/utils/markdown.util';
import { encodeCursor, decodeCursor } from '@common/utils/cursor.util';
import { escapeLike } from '@common/utils/search.util';
import { PUBLIC_RESOURCE_STATUSES, RESOURCE_STATUS } from '@common/utils/constants';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';
import { MflClientService } from './mfl-client.service';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ResourceFileMeta {
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
}

export interface MflFileMeta {
  file_name: string;
  file_size: number;
  mime_type: string;
  file_buffer: Buffer;
}

type ResourceListScope = 'public' | 'admin';

const RESOURCE_STATUS_PENDING = RESOURCE_STATUS.pending;
const RESOURCE_STATUS_APPROVED = RESOURCE_STATUS.approved;
const RESOURCE_STATUS_REJECTED = RESOURCE_STATUS.rejected;

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(Resource)
    private resourceRepository: Repository<Resource>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(ResourceCategory)
    private categoryRepository: Repository<ResourceCategory>,
    @InjectRepository(ResourceVersion)
    private versionRepository: Repository<ResourceVersion>,
    private dataSource: DataSource,
    private adminNotificationsService: AdminNotificationsService,
    private mflClientService: MflClientService,
  ) {}

  private normalizeResourceType(resourceType: string): string {
    return resourceType === 'file' ? 'upload' : resourceType;
  }

  private toOptionalNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException('Invalid numeric value');
    }
    return parsed;
  }

  private toTinyInt(value: unknown, defaultValue: number): number {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value === 'true') return 1;
    if (value === 'false') return 0;
    return Number(value) ? 1 : 0;
  }

  private normalizeVersion(version: ResourceVersion) {
    return {
      ...version,
      file_size: version.file_size || 0,
    };
  }

  private normalizeResource(resource: Resource, versions?: ResourceVersion[]) {
    return {
      ...resource,
      is_public: resource.is_public === 1,
      use_mfl: resource.use_mfl === 1,
      file_size: resource.file_size || 0,
      username: resource.user?.username || '',
      avatar_url: resource.user?.avatar_url || null,
      category_name: resource.category?.name || null,
      category_icon: resource.category?.icon || null,
      versions: versions?.map((version) => this.normalizeVersion(version)),
    };
  }

  private async deleteStoredFile(filePath?: string | null): Promise<void> {
    if (!filePath) return;

    try {
      await fs.unlink(path.resolve(filePath));
    } catch {
      console.warn(`File not found: ${filePath}`);
    }
  }

  async create(dto: CreateResourceDto, userId: number, file?: ResourceFileMeta, mflMeta?: MflFileMeta): Promise<any> {
    return this.dataSource.transaction(async (manager) => {
      const categoryId = this.toOptionalNumber((dto as any).category_id);
      const resourceType = this.normalizeResourceType(dto.resource_type);
      const useMfl = !!dto.use_mfl;

      if (categoryId) {
        const category = await manager.findOne(ResourceCategory, {
          where: { id: categoryId },
        });
        if (!category) {
          throw new BadRequestException('Category does not exist');
        }
      }

      if (!['upload', 'external'].includes(resourceType)) {
        throw new BadRequestException('Invalid resource type');
      }

      if (resourceType === 'upload' && !file && !mflMeta) {
        throw new BadRequestException('A file is required for uploaded resources');
      }

      if (resourceType === 'external' && !dto.external_url) {
        throw new BadRequestException('An external URL is required');
      }

      let savedResourceId: number;

      if (useMfl && mflMeta) {
        const categorySlug = categoryId
          ? (await manager.findOne(ResourceCategory, { where: { id: categoryId } }))?.slug || 'uncategorized'
          : 'uncategorized';

        // Create resource first to get an ID for MFL
        const tempResource = manager.create(Resource, {
          user_id: userId,
          title: dto.title,
          resource_type: resourceType,
          status: 'pending',
        });
        const tempSaved = await manager.save(tempResource);
        savedResourceId = tempSaved.id;

        const mflResult = await this.mflClientService.uploadFile(
          mflMeta.file_buffer,
          mflMeta.file_name,
          categorySlug,
          mflMeta.mime_type,
          { resourceId: tempSaved.id },
        );

        if (!mflResult) {
          // MFL not configured — clean up the temp record and fail
          await manager.delete(Resource, tempSaved.id);
          throw new BadRequestException('MindFileList service is not configured. Please upload locally or contact an admin.');
        }

        const mflFileId = mflResult.id;
        const mflDownloadUrl = this.mflClientService.getDownloadUrl(mflResult.id);

        // Update the resource with MFL metadata
        const contentHtml = dto.content ? parseMarkdown(dto.content) : undefined;

        await manager.update(Resource, tempSaved.id, {
          description: dto.description,
          resource_type: resourceType,
          file_name: mflMeta.file_name,
          file_size: mflMeta.file_size,
          mime_type: mflMeta.mime_type,
          external_url: undefined,
          version: dto.version,
          content: dto.content,
          content_html: contentHtml,
          category_id: categoryId,
          is_public: this.toTinyInt((dto as any).is_public, 1),
          download_count: 0,
          use_mfl: 1,
          mfl_file_id: mflFileId,
          mfl_download_url: mflDownloadUrl,
        } as any);
      } else {
        // Standard local upload
        const contentHtml = dto.content ? parseMarkdown(dto.content) : undefined;

        const newResource = manager.create(Resource, {
          user_id: userId,
          title: dto.title,
          description: dto.description,
          resource_type: resourceType,
          file_name: file?.file_name,
          file_path: file?.file_path,
          file_size: file?.file_size,
          mime_type: file?.mime_type,
          external_url: resourceType === 'external' ? dto.external_url : undefined,
          version: dto.version,
          content: dto.content,
          content_html: contentHtml,
          category_id: categoryId,
          is_public: this.toTinyInt((dto as any).is_public, 1),
          status: 'pending',
          download_count: 0,
        });
        const saved = await manager.save(newResource);
        savedResourceId = saved.id;
      }

      const finalResult = await manager.findOne(Resource, {
        where: { id: savedResourceId },
        relations: ['user', 'category'],
      });

      if (!finalResult) {
        throw new NotFoundException('Resource does not exist');
      }

      if (finalResult.status === RESOURCE_STATUS_PENDING) {
        this.adminNotificationsService.publishModerationPending({
          item_type: 'resource',
          item_id: finalResult.id,
          title: finalResult.title,
          content: dto.description || dto.content || dto.external_url || mflMeta?.file_name || file?.file_name || null,
          author_username: finalResult.user?.username || `#${userId}`,
          action_url: '/admin/resources/moderation',
        }).catch((err) =>
          console.error('Admin resource moderation notification error:', err),
        );
      }

      return this.normalizeResource(finalResult);
    });
  }

  async getList(
    query: QueryResourcesDto,
    options: { scope?: ResourceListScope } = {},
  ): Promise<any> {
    const {
      limit = 20,
      category_id,
      search,
      status,
      sort = 'created_at',
      cursor,
    } = query;
    const scope = options.scope ?? 'public';

    const where: any = {};

    if (category_id) {
      where.category_id = category_id;
    }

    if (scope === 'public') {
      where.status = In(PUBLIC_RESOURCE_STATUSES);
      where.is_public = 1;
    } else if (status) {
      where.status = status;
    }

    if (search) {
      where.title = Like(`%${escapeLike(search)}%`);
    }

    let cursorCondition: any = {};
    if (cursor) {
      try {
        const decoded = decodeCursor(cursor);
        const cursorValue =
          sort === 'created_at' ? new Date(parseInt(decoded[0])) : parseInt(decoded[0]);
        const idValue = parseInt(decoded[1]);

        cursorCondition = [
          { [sort]: LessThan(cursorValue) },
          { [sort]: cursorValue, id: LessThan(idValue) },
        ];
      } catch {
        // Ignore invalid cursors.
      }
    }

    const resources = await this.resourceRepository.find({
      where: cursorCondition.length > 0
        ? [{ ...where, ...cursorCondition[0] }, { ...where, ...cursorCondition[1] }]
        : where,
      relations: ['user', 'category'],
      order: {
        [sort]: 'DESC',
        id: 'DESC',
      },
      take: Number(limit) + 1,
    });

    const hasMore = resources.length > Number(limit);
    if (hasMore) {
      resources.pop();
    }

    let nextCursor: string | null = null;
    if (hasMore && resources.length > 0) {
      const lastResource = resources[resources.length - 1];
      const cursorValue =
        sort === 'created_at'
          ? lastResource.created_at.getTime().toString()
          : lastResource[sort].toString();
      nextCursor = encodeCursor(cursorValue, lastResource.id.toString());
    }

    return {
      data: resources.map((resource) => this.normalizeResource(resource)),
      nextCursor,
      hasMore,
      next_cursor: nextCursor,
      has_more: hasMore,
    };
  }

  async getById(id: number): Promise<any> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
      relations: ['user', 'category'],
    });

    if (!resource) {
      throw new NotFoundException('Resource does not exist');
    }

    return this.normalizeResource(resource);
  }

  async getByIdWithVersions(id: number): Promise<any> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
      relations: ['user', 'category'],
    });

    if (!resource) {
      throw new NotFoundException('Resource does not exist');
    }

    const versions = await this.versionRepository.find({
      where: { resource_id: id },
      order: { created_at: 'DESC' },
    });

    return this.normalizeResource(resource, versions);
  }

  async incrementDownload(id: number): Promise<void> {
    await this.resourceRepository.increment({ id }, 'download_count', 1);
  }

  async getByUserId(
    userId: number,
    limit: number = 20,
    cursor?: string,
  ): Promise<any> {
    const where: any = { user_id: userId };

    let cursorCondition: any = {};
    if (cursor) {
      try {
        const decoded = decodeCursor(cursor);
        const cursorValue = new Date(parseInt(decoded[0]));
        const idValue = parseInt(decoded[1]);

        cursorCondition = [
          { created_at: LessThan(cursorValue) },
          { created_at: cursorValue, id: LessThan(idValue) },
        ];
      } catch {
        // Ignore invalid cursors.
      }
    }

    const resources = await this.resourceRepository.find({
      where: cursorCondition.length > 0
        ? [{ ...where, ...cursorCondition[0] }, { ...where, ...cursorCondition[1] }]
        : where,
      relations: ['user', 'category'],
      order: {
        created_at: 'DESC',
        id: 'DESC',
      },
      take: Number(limit) + 1,
    });

    const hasMore = resources.length > Number(limit);
    if (hasMore) {
      resources.pop();
    }

    let nextCursor: string | null = null;
    if (hasMore && resources.length > 0) {
      const lastResource = resources[resources.length - 1];
      const cursorValue = lastResource.created_at.getTime().toString();
      nextCursor = encodeCursor(cursorValue, lastResource.id.toString());
    }

    return {
      data: resources.map((resource) => this.normalizeResource(resource)),
      nextCursor,
      hasMore,
      next_cursor: nextCursor,
      has_more: hasMore,
    };
  }

  async update(id: number, userId: number, dto: UpdateResourceDto): Promise<any> {
    return this.dataSource.transaction(async (manager) => {
      const resource = await manager.findOne(Resource, {
        where: { id },
        relations: ['user'],
      });

      if (!resource) {
        throw new NotFoundException('Resource does not exist');
      }

      if (resource.user_id !== userId) {
        throw new ForbiddenException('No permission to edit this resource');
      }

      const categoryId = this.toOptionalNumber((dto as any).category_id);
      if (categoryId && categoryId !== resource.category_id) {
        const category = await manager.findOne(ResourceCategory, {
          where: { id: categoryId },
        });
        if (!category) {
          throw new BadRequestException('Category does not exist');
        }
      }

      const updateData: Partial<Resource> = {};

      if (dto.title) updateData.title = dto.title;
      if (dto.description !== undefined) updateData.description = dto.description;
      if (dto.resource_type) {
        const resourceType = this.normalizeResourceType(dto.resource_type);
        if (!['upload', 'external'].includes(resourceType)) {
          throw new BadRequestException('Invalid resource type');
        }
        updateData.resource_type = resourceType;
      }
      if (dto.external_url !== undefined) updateData.external_url = dto.external_url;
      if (dto.version !== undefined) updateData.version = dto.version;
      if (dto.content !== undefined) {
        updateData.content = dto.content;
        updateData.content_html = parseMarkdown(dto.content);
      }
      if ((dto as any).category_id !== undefined) updateData.category_id = categoryId;
      if ((dto as any).is_public !== undefined) {
        updateData.is_public = this.toTinyInt((dto as any).is_public, resource.is_public);
      }

      await manager.update(Resource, id, updateData);

      const result = await manager.findOne(Resource, {
        where: { id },
        relations: ['user', 'category'],
      });

      if (!result) {
        throw new NotFoundException('Resource does not exist');
      }

      return this.normalizeResource(result);
    });
  }

  async delete(id: number, userId: number): Promise<void> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!resource) {
      throw new NotFoundException('Resource does not exist');
    }

    if (resource.user_id !== userId) {
      throw new ForbiddenException('No permission to delete this resource');
    }

    await this.deleteStoredFile(resource.file_path);

    const versions = await this.versionRepository.find({ where: { resource_id: id } });
    for (const version of versions) {
      await this.deleteStoredFile(version.file_path);
    }

    await this.versionRepository.delete({ resource_id: id });
    await this.resourceRepository.delete(id);
  }

  async adminDelete(id: number): Promise<void> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
    });

    if (!resource) {
      throw new NotFoundException('Resource does not exist');
    }

    await this.deleteStoredFile(resource.file_path);

    const versions = await this.versionRepository.find({ where: { resource_id: id } });
    for (const version of versions) {
      await this.deleteStoredFile(version.file_path);
    }

    await this.versionRepository.delete({ resource_id: id });
    await this.resourceRepository.delete(id);
  }

  async updateStatus(
    id: number,
    status: string,
    options: { actorUsername?: string | null } = {},
  ): Promise<any> {
    const validStatuses: string[] = [
      RESOURCE_STATUS_PENDING,
      RESOURCE_STATUS_APPROVED,
      RESOURCE_STATUS_REJECTED,
    ];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException('Invalid status');
    }

    const existingResource = await this.resourceRepository.findOne({
      where: { id },
      relations: ['user', 'category'],
    });

    if (!existingResource) {
      throw new NotFoundException('Resource does not exist');
    }

    if (existingResource.status !== status) {
      await this.resourceRepository.update(id, { status });

      // Sync approval status to MFL if applicable
      if (existingResource.use_mfl && existingResource.mfl_file_id) {
        const mflStatus = status === RESOURCE_STATUS_APPROVED ? 'approved'
          : status === RESOURCE_STATUS_REJECTED ? 'rejected' : null;
        if (mflStatus) {
          this.mflClientService.updateApprovalStatus(
            existingResource.mfl_file_id,
            mflStatus,
            id,
          ).catch((err) =>
            console.error('MFL approval sync error:', err),
          );
        }
      }
    }

    const resource = existingResource.status === status
      ? existingResource
      : await this.resourceRepository.findOne({
        where: { id },
        relations: ['user', 'category'],
      });

    if (!resource) {
      throw new NotFoundException('Resource does not exist');
    }

    if (
      existingResource.status !== status
      && [RESOURCE_STATUS_APPROVED, RESOURCE_STATUS_REJECTED].includes(status as any)
    ) {
      this.adminNotificationsService.publishModerationResult({
        item_type: 'resource',
        item_id: resource.id,
        action: status as 'approved' | 'rejected',
        actor_username: options.actorUsername || undefined,
        subject: resource.title,
        action_url: `/admin/resources?status=${status}`,
      }).catch((err) =>
        console.error('Admin resource moderation result notification error:', err),
      );
    }

    return this.normalizeResource(resource);
  }

  async countByStatus(status: string): Promise<number> {
    return this.resourceRepository.count({
      where: { status },
    });
  }
}
