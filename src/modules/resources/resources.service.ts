import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Like, MoreThan, LessThan } from 'typeorm';
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
import * as fs from 'fs/promises';
import * as path from 'path';

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
  ) {}

  /**
   * Create a new resource
   */
  async create(dto: CreateResourceDto, userId: number): Promise<Resource | null> {
    return this.dataSource.transaction(async (manager) => {
      // Validate category if provided
      if (dto.category_id) {
        const category = await manager.findOne(ResourceCategory, {
          where: { id: dto.category_id },
        });
        if (!category) {
          throw new BadRequestException('分类不存在');
        }
      }

      // Validate resource_type
      if (!['upload', 'external'].includes(dto.resource_type)) {
        throw new BadRequestException('无效的资源类型');
      }

      // Parse markdown to HTML if content provided
      const contentHtml = dto.content ? parseMarkdown(dto.content) : undefined;

      // Create the resource
      const newResource = manager.create(Resource, {
        user_id: userId,
        title: dto.title,
        description: dto.description,
        resource_type: dto.resource_type,
        external_url: dto.external_url,
        version: dto.version,
        content: dto.content,
        content_html: contentHtml,
        category_id: dto.category_id,
        is_public: dto.is_public !== undefined ? dto.is_public : 0,
        status: 'pending',
        download_count: 0,
      });
      const savedResource = await manager.save(newResource);

      // Return with relations
      const result = await manager.findOne(Resource, {
        where: { id: savedResource.id },
        relations: ['user', 'category'],
      });

      return result;
    });
  }

  /**
   * Get resource list with cursor pagination
   */
  async getList(query: QueryResourcesDto): Promise<{
    data: Resource[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const {
      limit = 20,
      category_id,
      search,
      status = 'approved',
      sort = 'created_at',
      cursor,
    } = query;

    const where: any = {};

    if (category_id) {
      where.category_id = category_id;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.title = Like(`%${escapeLike(search)}%`);
    }

    // Decode cursor for pagination
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
      } catch (e) {
        // Invalid cursor, ignore
      }
    }

    const resources = await this.resourceRepository.find({
      where: cursorCondition.length > 0
        ? [{ ...where, ...cursorCondition[0] }, { ...where, ...cursorCondition[1] }]
        : where,
      relations: ['user', 'category'],
      select: {
        id: true,
        user_id: true,
        category_id: true,
        title: true,
        description: true,
        resource_type: true,
        file_name: true,
        file_size: true,
        mime_type: true,
        external_url: true,
        version: true,
        content: true,
        status: true,
        is_public: true,
        download_count: true,
        created_at: true,
        updated_at: true,
      },
      order: {
        [sort]: 'DESC',
        id: 'DESC',
      },
      take: limit + 1,
    });

    const hasMore = resources.length > limit;
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
      data: resources,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Get resource by ID with user and category info
   */
  async getById(id: number): Promise<Resource> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
      relations: ['user', 'category'],
    });

    if (!resource) {
      throw new NotFoundException('资源不存在');
    }

    return resource;
  }

  /**
   * Get resource by ID with versions
   */
  async getByIdWithVersions(id: number): Promise<Resource & { versions: ResourceVersion[] }> {
    const resource = await this.getById(id);

    const versions = await this.versionRepository.find({
      where: { resource_id: id },
      order: { created_at: 'DESC' },
    });

    return {
      ...resource,
      versions,
    };
  }

  /**
   * Increment download count
   */
  async incrementDownload(id: number): Promise<void> {
    await this.resourceRepository.increment({ id }, 'download_count', 1);
  }

  /**
   * Get resources by user ID with cursor pagination
   */
  async getByUserId(
    userId: number,
    limit: number = 20,
    cursor?: string,
  ): Promise<{
    data: Resource[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
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
      } catch (e) {
        // Invalid cursor, ignore
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
      take: limit + 1,
    });

    const hasMore = resources.length > limit;
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
      data: resources,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Update resource (owner only)
   */
  async update(id: number, userId: number, dto: UpdateResourceDto): Promise<Resource | null> {
    return this.dataSource.transaction(async (manager) => {
      const resource = await manager.findOne(Resource, {
        where: { id },
        relations: ['user'],
      });

      if (!resource) {
        throw new NotFoundException('资源不存在');
      }

      if (resource.user_id !== userId) {
        throw new ForbiddenException('无权限编辑此资源');
      }

      // Validate category if changing
      if (dto.category_id && dto.category_id !== resource.category_id) {
        const category = await manager.findOne(ResourceCategory, {
          where: { id: dto.category_id },
        });
        if (!category) {
          throw new BadRequestException('分类不存在');
        }
      }

      // Build update data
      const updateData: Partial<Resource> = {};

      if (dto.title) updateData.title = dto.title;
      if (dto.description !== undefined) updateData.description = dto.description;
      if (dto.resource_type) {
        if (!['upload', 'external'].includes(dto.resource_type)) {
          throw new BadRequestException('无效的资源类型');
        }
        updateData.resource_type = dto.resource_type;
      }
      if (dto.external_url !== undefined) updateData.external_url = dto.external_url;
      if (dto.version !== undefined) updateData.version = dto.version;
      if (dto.content !== undefined) {
        updateData.content = dto.content;
        updateData.content_html = parseMarkdown(dto.content);
      }
      if (dto.category_id !== undefined) updateData.category_id = dto.category_id;
      if (dto.is_public !== undefined) updateData.is_public = dto.is_public;

      await manager.update(Resource, id, updateData);

      const result = await manager.findOne(Resource, {
        where: { id },
        relations: ['user', 'category'],
      });

      return result;
    });
  }

  /**
   * Delete resource (owner only, delete file from disk)
   */
  async delete(id: number, userId: number): Promise<void> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!resource) {
      throw new NotFoundException('资源不存在');
    }

    if (resource.user_id !== userId) {
      throw new ForbiddenException('无权限删除此资源');
    }

    // Delete file from disk if it's an upload type
    if (resource.resource_type === 'upload' && resource.file_path) {
      try {
        const filePath = path.resolve(resource.file_path);
        await fs.unlink(filePath);
      } catch (err) {
        // File might not exist, continue
        console.warn(`File not found: ${resource.file_path}`);
      }
    }

    // Delete versions
    await this.versionRepository.delete({ resource_id: id });

    // Delete resource
    await this.resourceRepository.delete(id);
  }

  /**
   * Admin delete resource (delete file from disk)
   */
  async adminDelete(id: number): Promise<void> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
    });

    if (!resource) {
      throw new NotFoundException('资源不存在');
    }

    // Delete file from disk if it's an upload type
    if (resource.resource_type === 'upload' && resource.file_path) {
      try {
        const filePath = path.resolve(resource.file_path);
        await fs.unlink(filePath);
      } catch (err) {
        // File might not exist, continue
        console.warn(`File not found: ${resource.file_path}`);
      }
    }

    // Delete versions
    await this.versionRepository.delete({ resource_id: id });

    // Delete resource
    await this.resourceRepository.delete(id);
  }

  /**
   * Update resource status (admin/mod)
   */
  async updateStatus(id: number, status: string): Promise<Resource> {
    const validStatuses = ['pending', 'approved', 'rejected'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException('无效的状态');
    }

    await this.resourceRepository.update(id, { status });

    const resource = await this.resourceRepository.findOne({
      where: { id },
      relations: ['user', 'category'],
    });

    if (!resource) {
      throw new NotFoundException('资源不存在');
    }

    return resource;
  }

  /**
   * Count resources by status
   */
  async countByStatus(status: string): Promise<number> {
    return this.resourceRepository.count({
      where: { status },
    });
  }
}
