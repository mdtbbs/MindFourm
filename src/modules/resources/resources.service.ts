import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, Like, LessThan, In } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceCategory } from '@entities/resource-category.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { ResourceRating } from '@entities/resource-rating.entity';
import { User } from '@entities/user.entity';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { QueryResourcesDto } from './dto/query-resources.dto';
import { parseMarkdown } from '@common/utils/markdown.util';
import { encodeCursor, decodeCursor } from '@common/utils/cursor.util';
import { escapeLike } from '@common/utils/search.util';
import { PUBLIC_RESOURCE_STATUSES, RESOURCE_STATUS } from '@common/utils/constants';
import { isSafeExternalUrl } from '@common/utils/safe-url.util';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MflClientService } from './mfl-client.service';
import { ResourceCategoryService } from './resource-categories.service';
import { isValidRating, ratingAggregateDelta, validateResourceSort } from './resource-rating.util';

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
    @InjectRepository(ResourceRating)
    private ratingRepository: Repository<ResourceRating>,
    private dataSource: DataSource,
    private adminNotificationsService: AdminNotificationsService,
    private notificationsService: NotificationsService,
    private mflClientService: MflClientService,
    private categoryService: ResourceCategoryService,
  ) {}

  private normalizeResourceType(resourceType: string): string {
    return resourceType === 'file' ? 'upload' : resourceType;
  }

  private toOptionalNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException('无效的数值');
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
      slug: resource.slug || null,
      rating_count: resource.rating_count || 0,
      rating_sum: resource.rating_sum || 0,
      rating_average: Number(resource.rating_average) || 0,
      username: resource.user?.username || '',
      avatar_url: resource.user?.avatar_url || null,
      category_name: resource.category?.name || null,
      category_icon: resource.category?.icon || null,
      versions: versions?.map((version) => this.normalizeVersion(version)),
    };
  }

  /**
   * Unified public-visibility predicate for resources.
   *
   * A resource is publicly accessible when ALL of the following hold:
   *   1. Its status is in PUBLIC_RESOURCE_STATUSES (approved / published).
   *   2. It is marked public (is_public = 1).
   *   3. Its category exists and is active — or it has no category at all.
   *
   * Centralising the check here keeps `assertResourceVisible`, list queries,
   * and single-resource reads consistent: a disabled category hides every
   * resource beneath it, not just some.
   */
  async isResourcePubliclyAccessible(resource: {
    status?: string;
    is_public?: number;
    category_id?: number | null;
  }): Promise<boolean> {
    const isApproved = (PUBLIC_RESOURCE_STATUSES as readonly string[]).includes(
      resource.status ?? '',
    );
    if (!isApproved || resource.is_public !== 1) {
      return false;
    }

    if (resource.category_id) {
      try {
        const category = await this.categoryService.getById(resource.category_id);
        if (!category || category.is_active !== 1) {
          return false;
        }
      } catch {
        // getById throws NotFoundException when the category is missing.
        return false;
      }
    }

    return true;
  }

  /**
   * List only resources that pass the public-visibility predicate, using a
   * single query with an INNER JOIN on the category so inactive categories
   * are excluded at the database level rather than in application code.
   */
  async getPublicResources(): Promise<Resource[]> {
    return this.resourceRepository
      .createQueryBuilder('resource')
      .innerJoin('resource.category', 'category')
      .where('resource.status IN (:...statuses)', { statuses: PUBLIC_RESOURCE_STATUSES })
      .andWhere('resource.is_public = :isPublic', { isPublic: 1 })
      .andWhere('category.is_active = :categoryActive', { categoryActive: 1 })
      .orderBy('resource.created_at', 'DESC')
      .getMany();
  }

  /**
   * Fetch a single resource by ID, returning null when it exists but is not
   * publicly accessible (rather than throwing). Composes `getById` with the
   * visibility predicate.
   */
  async getPublicResourceById(id: number): Promise<any | null> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
      relations: ['user', 'category'],
    });

    if (!resource) return null;

    const isAccessible = await this.isResourcePubliclyAccessible(resource);
    return isAccessible ? this.normalizeResource(resource) : null;
  }

  async create(dto: CreateResourceDto, userId: number, file?: ResourceFileMeta, mflMeta?: MflFileMeta): Promise<any> {
    const categoryId = this.toOptionalNumber((dto as any).category_id);
    const resourceType = this.normalizeResourceType(dto.resource_type);
    const useMfl = !!dto.use_mfl;

    const category = categoryId
      ? await this.categoryRepository.findOne({ where: { id: categoryId } })
      : null;
    if (categoryId && !category) {
      throw new BadRequestException('分类不存在');
    }

    if (!['upload', 'external'].includes(resourceType)) {
      throw new BadRequestException('无效的资源类型');
    }

    if (resourceType === 'upload' && !file && !mflMeta) {
      throw new BadRequestException('文件类资源必须上传文件');
    }

    if (resourceType === 'external' && !dto.external_url) {
      throw new BadRequestException('外链类资源必须填写外链地址');
    }

    const contentHtml = dto.content ? parseMarkdown(dto.content) : undefined;

    const newResource = this.resourceRepository.create({
      user_id: userId,
      title: dto.title,
      description: dto.description,
      resource_type: resourceType,
      file_name: useMfl && mflMeta ? mflMeta.file_name : file?.file_name,
      file_path: useMfl && mflMeta ? undefined : file?.file_path,
      file_size: useMfl && mflMeta ? mflMeta.file_size : file?.file_size,
      mime_type: useMfl && mflMeta ? mflMeta.mime_type : file?.mime_type,
      external_url: resourceType === 'external' ? dto.external_url : undefined,
      version: dto.version,
      content: dto.content,
      content_html: contentHtml,
      category_id: categoryId,
      is_public: this.toTinyInt((dto as any).is_public, 1),
      status: RESOURCE_STATUS_PENDING,
      download_count: 0,
      use_mfl: useMfl && mflMeta ? 1 : 0,
    });

    const saved = await this.resourceRepository.save(newResource);

    if (useMfl && mflMeta) {
      await this.attachMflUpload(saved.id, mflMeta, category?.slug || 'uncategorized');
    }

    const finalResult = await this.resourceRepository.findOne({
      where: { id: saved.id },
      relations: ['user', 'category'],
    });

    if (!finalResult) {
      throw new NotFoundException('资源不存在');
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
  }

  /**
   * Push an already-persisted resource's payload to MindFileList and record the
   * identifiers it hands back.
   *
   * Deliberately outside any database transaction. The upload used to run inside
   * `create`'s transaction, so a 50 MB POST held a connection and row locks open
   * for its whole duration — and the compensating `manager.delete` on the failure
   * path was itself inside the doomed transaction, so it rolled back with
   * everything else and the uploaded file was orphaned on MFL forever.
   *
   * The resource row is committed as `pending` first: a metadata row with no
   * download URL is harmless (moderation hides it either way), whereas a remote
   * file with nothing pointing at it is unreclaimable.
   */
  private async attachMflUpload(
    resourceId: number,
    mflMeta: MflFileMeta,
    categorySlug: string,
  ): Promise<void> {
    let mflResult: Awaited<ReturnType<MflClientService['uploadFile']>>;
    try {
      mflResult = await this.mflClientService.uploadFile(
        mflMeta.file_buffer,
        mflMeta.file_name,
        categorySlug,
        mflMeta.mime_type,
        { resourceId },
      );
    } catch (err) {
      // Nothing was stored remotely, so the placeholder row is safe to drop.
      await this.resourceRepository.delete(resourceId);
      throw err;
    }

    if (!mflResult) {
      await this.resourceRepository.delete(resourceId);
      throw new BadRequestException('文件站服务未配置，请改用本地上传或联系管理员');
    }

    try {
      await this.resourceRepository.update(resourceId, {
        mfl_file_id: mflResult.id,
        mfl_download_url: this.mflClientService.getDownloadUrl(mflResult.id),
      });
    } catch (err) {
      // The file exists on MFL but nothing will ever reference it — block it from
      // being downloaded before discarding the row.
      await this.mflClientService.blockDownloads(
        mflResult.id,
        resourceId,
        'the forum could not record the upload',
      );
      await this.resourceRepository.delete(resourceId);
      throw err;
    }
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
      cursor,
    } = query;
    const scope = options.scope ?? 'public';
    const sort = validateResourceSort(query.sort);

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
      next_cursor: nextCursor,
      has_more: hasMore,
    };
  }

  /**
   * Authorize a single-resource read.
   *
   * Enforces the same scoping `getList` applies to lists. Without it, fetching by
   * id returned pending and rejected resources — and, via the download route,
   * served their files — which defeated the moderation queue entirely and turned
   * `external_url` into an open redirect that needed no approval.
   *
   * Delegates to `isResourcePubliclyAccessible` for the public path so the
   * category-active check is applied uniformly.
   */
  private async assertResourceVisible(
    resource: { status?: string; is_public?: number; user_id?: number; category_id?: number | null },
    viewer?: { id: number; role: string },
  ): Promise<void> {
    const isStaff = !!viewer && ['admin', 'moderator'].includes(viewer.role);
    const isOwner = !!viewer && resource.user_id === viewer.id;
    if (isStaff || isOwner) {
      return;
    }

    const accessible = await this.isResourcePubliclyAccessible(resource);
    if (!accessible) {
      // 404 rather than 403 so unapproved submissions are not enumerable.
      throw new NotFoundException('资源不存在');
    }
  }

  async getById(id: number, viewer?: { id: number; role: string }): Promise<any> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
      relations: ['user', 'category'],
    });

    if (!resource) {
      throw new NotFoundException('资源不存在');
    }

    await this.assertResourceVisible(resource, viewer);

    return this.normalizeResource(resource);
  }

  async getByIdWithVersions(id: number, viewer?: { id: number; role: string }): Promise<any> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
      relations: ['user', 'category'],
    });

    if (!resource) {
      throw new NotFoundException('资源不存在');
    }

    await this.assertResourceVisible(resource, viewer);

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
      next_cursor: nextCursor,
      has_more: hasMore,
    };
  }

  /**
   * Get public approved resources by user ID (for user profile display)
   */
  async getPublicByUserId(
    userId: number,
    limit: number = 20,
    cursor?: string,
  ): Promise<any> {
    const where: any = {
      user_id: userId,
      status: 'approved',
      is_public: 1,
    };

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
      next_cursor: nextCursor,
      has_more: hasMore,
    };
  }

  async update(
    id: number,
    userId: number,
    dto: UpdateResourceDto,
    userRole?: string,
  ): Promise<any> {
    return this.dataSource.transaction(async (manager) => {
      const resource = await manager.findOne(Resource, {
        where: { id },
        relations: ['user'],
      });

      if (!resource) {
        throw new NotFoundException('资源不存在');
      }

      // Staff may edit any resource — this branch was missing, unlike PostsService.
      const isStaff = userRole === 'admin' || userRole === 'moderator';
      if (resource.user_id !== userId && !isStaff) {
        throw new ForbiddenException('没有权限编辑此资源');
      }

      const categoryId = this.toOptionalNumber((dto as any).category_id);
      if (categoryId && categoryId !== resource.category_id) {
        const category = await manager.findOne(ResourceCategory, {
          where: { id: categoryId },
        });
        if (!category) {
          throw new BadRequestException('分类不存在');
        }
      }

      const updateData: Partial<Resource> = {};

      if (dto.title) updateData.title = dto.title;
      if (dto.description !== undefined) updateData.description = dto.description;
      if (dto.resource_type) {
        const resourceType = this.normalizeResourceType(dto.resource_type);
        if (!['upload', 'external'].includes(resourceType)) {
          throw new BadRequestException('无效的资源类型');
        }
        updateData.resource_type = resourceType;
      }
      if (dto.external_url !== undefined) {
        if (dto.external_url && !isSafeExternalUrl(dto.external_url)) {
          throw new BadRequestException('外部链接必须是 http 或 https 地址');
        }
        updateData.external_url = dto.external_url;
      }
      if (dto.version !== undefined) updateData.version = dto.version;
      if (dto.content !== undefined) {
        updateData.content = dto.content;
        updateData.content_html = parseMarkdown(dto.content);
      }
      if ((dto as any).category_id !== undefined) updateData.category_id = categoryId;
      if ((dto as any).is_public !== undefined) {
        updateData.is_public = this.toTinyInt((dto as any).is_public, resource.is_public);
      }

      // Changing what people actually download has to go back through moderation.
      // Otherwise an owner could get a benign resource approved and then swap
      // `external_url` for a malware link while keeping the approved badge.
      const payloadChanged =
        (dto.external_url !== undefined && dto.external_url !== resource.external_url) ||
        (dto.resource_type !== undefined &&
          updateData.resource_type !== undefined &&
          updateData.resource_type !== resource.resource_type);

      if (payloadChanged && !isStaff && PUBLIC_RESOURCE_STATUSES.includes(resource.status as any)) {
        updateData.status = 'pending';
      }

      await manager.update(Resource, id, updateData);

      const result = await manager.findOne(Resource, {
        where: { id },
        relations: ['user', 'category'],
      });

      if (!result) {
        throw new NotFoundException('资源不存在');
      }

      return this.normalizeResource(result);
    });
  }

  async delete(id: number, userId: number, userRole?: string): Promise<void> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!resource) {
      throw new NotFoundException('资源不存在');
    }

    const isStaff = userRole === 'admin' || userRole === 'moderator';
    if (resource.user_id !== userId && !isStaff) {
      throw new ForbiddenException('没有权限删除此资源');
    }

    await this.softDeleteResource(resource);
  }

  async adminDelete(id: number): Promise<void> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
    });

    if (!resource) {
      throw new NotFoundException('资源不存在');
    }

    await this.softDeleteResource(resource);
  }

  /**
   * Retire a resource, matching how posts and replies are deleted.
   *
   * `resources.deleted_at` has existed for a while, so hard-deleting the row (and
   * its versions, and the files on disk) was both inconsistent with the rest of
   * the forum and unrecoverable. Once the row is soft-deleted the entity's
   * `@DeleteDateColumn` hides it from every read, so the forum stops serving it.
   *
   * An MFL-hosted payload is reachable by direct link regardless of what the forum
   * shows, so it is explicitly quarantined. Local files stay on disk until the row
   * is purged — see the note in the accompanying report; no retention sweep covers
   * `resources` yet.
   */
  private async softDeleteResource(resource: Resource): Promise<void> {
    if (resource.use_mfl && resource.mfl_file_id) {
      await this.mflClientService.blockDownloads(
        resource.mfl_file_id,
        resource.id,
        'the forum resource was deleted',
      );
    }

    await this.resourceRepository.softDelete(resource.id);
  }

  async updateStatus(
    id: number,
    status: string,
    options: { actorUsername?: string | null; rejectReason?: string | null } = {},
  ): Promise<any> {
    const validStatuses: string[] = [
      RESOURCE_STATUS_PENDING,
      RESOURCE_STATUS_APPROVED,
      RESOURCE_STATUS_REJECTED,
    ];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException('无效的状态');
    }

    const existingResource = await this.resourceRepository.findOne({
      where: { id },
      relations: ['user', 'category'],
    });

    if (!existingResource) {
      throw new NotFoundException('资源不存在');
    }

    if (existingResource.status !== status) {
      const updateData: Partial<Resource> = { status };
      if (status === RESOURCE_STATUS_REJECTED) {
        updateData.reject_reason = options.rejectReason || null;
      } else if (status === RESOURCE_STATUS_APPROVED) {
        updateData.reject_reason = null;
      }
      await this.resourceRepository.update(id, updateData);

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
      throw new NotFoundException('资源不存在');
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

      // Notify the resource author about the moderation result
      const notificationContent = status === RESOURCE_STATUS_APPROVED
        ? `你的资源「${resource.title}」已通过审核`
        : `你的资源「${resource.title}」未通过审核${options.rejectReason ? '：' + options.rejectReason : ''}`;

      this.notificationsService.create({
        user_id: resource.user_id,
        type: 'system',
        content: notificationContent,
        emailEvent: 'system',
      }).catch((err) =>
        console.error('Resource author notification error:', err),
      );
    }

    return this.normalizeResource(resource);
  }

  async countByStatus(status: string): Promise<number> {
    return this.resourceRepository.count({
      where: { status },
    });
  }

  /**
   * Upsert a user's rating for a resource.
   * Creates or updates the rating and maintains denormalized aggregates.
   */
  async upsertRating(resourceId: number, userId: number, rating: number): Promise<any> {
    if (!isValidRating(rating)) {
      throw new BadRequestException('评分必须是 1 到 5 的整数');
    }

    return this.dataSource.transaction(async (manager) => {
      const resource = await manager.findOne(Resource, { where: { id: resourceId } });
      if (!resource) {
        throw new NotFoundException('资源不存在');
      }

      // Locking the caller's own rating row (there is a unique index on
      // resource_id+user_id) serialises concurrent submissions from the same user,
      // so `oldRating` cannot go stale between here and the aggregate update.
      const existingRating = await manager.findOne(ResourceRating, {
        where: { resource_id: resourceId, user_id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      const oldRating = existingRating?.rating ?? null;

      if (existingRating) {
        await manager.update(ResourceRating, existingRating.id, { rating });
      } else {
        await manager.save(
          ResourceRating,
          manager.create(ResourceRating, {
            resource_id: resourceId,
            user_id: userId,
            rating,
          }),
        );
      }

      await this.applyRatingDelta(manager, resourceId, oldRating, rating);

      const updatedResource = await manager.findOne(Resource, {
        where: { id: resourceId },
        relations: ['user', 'category'],
      });

      return this.normalizeResource(updatedResource!);
    });
  }

  /**
   * Delete a user's rating for a resource.
   */
  async deleteRating(resourceId: number, userId: number): Promise<any> {
    return this.dataSource.transaction(async (manager) => {
      const resource = await manager.findOne(Resource, { where: { id: resourceId } });
      if (!resource) {
        throw new NotFoundException('资源不存在');
      }

      const existingRating = await manager.findOne(ResourceRating, {
        where: { resource_id: resourceId, user_id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!existingRating) {
        throw new NotFoundException('未找到评分记录');
      }

      await manager.delete(ResourceRating, existingRating.id);

      await this.applyRatingDelta(manager, resourceId, existingRating.rating, null);

      const updatedResource = await manager.findOne(Resource, {
        where: { id: resourceId },
        relations: ['user', 'category'],
      });

      return this.normalizeResource(updatedResource!);
    });
  }

  /**
   * Apply a rating change to the denormalized aggregates in a single statement.
   *
   * The counters are shifted by a delta rather than overwritten with values
   * computed in JS from an earlier SELECT: two users rating a resource at the same
   * time both read the same `rating_count`/`rating_sum` and the second write
   * silently discarded the first, corrupting the aggregate for good.
   *
   * `rating_average` is derived in the same statement — MySQL evaluates SET
   * expressions left to right and later ones see the already-updated columns.
   * GREATEST(..., 0) keeps a replayed delete from pushing the counters negative.
   */
  private async applyRatingDelta(
    manager: EntityManager,
    resourceId: number,
    oldRating: number | null,
    newRating: number | null,
  ): Promise<void> {
    const { countDelta, sumDelta } = ratingAggregateDelta(oldRating, newRating);
    if (countDelta === 0 && sumDelta === 0) {
      return;
    }

    await manager.query(
      `UPDATE resources
          SET rating_count = GREATEST(rating_count + ?, 0),
              rating_sum = GREATEST(rating_sum + ?, 0),
              rating_average = CASE WHEN rating_count > 0
                                    THEN ROUND(rating_sum / rating_count, 2)
                                    ELSE 0 END
        WHERE id = ?`,
      [countDelta, sumDelta, resourceId],
    );
  }

  /**
   * Get a user's rating for a resource.
   */
  async getUserRating(resourceId: number, userId: number): Promise<number | null> {
    const rating = await this.ratingRepository.findOne({
      where: { resource_id: resourceId, user_id: userId },
    });

    return rating?.rating ?? null;
  }

  async getHotResources(limit: number = 10): Promise<any[]> {
    const resources = await this.resourceRepository.find({
      where: {
        status: In(PUBLIC_RESOURCE_STATUSES),
        is_public: 1,
      },
      relations: ['user', 'category'],
      order: {
        download_count: 'DESC',
      },
      take: limit,
    });

    return resources.map((resource) => this.normalizeResource(resource));
  }
}
