import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceCategory } from '@entities/resource-category.entity';
import { ResourceFile } from '@entities/resource-file.entity';
import { ResourcePackItem } from '@entities/resource-pack-item.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { ResourceVersionCompatibility } from '@entities/resource-version-compatibility.entity';
import { ResourceVersionDependency } from '@entities/resource-version-dependency.entity';
import { CapabilitiesService } from '../capabilities/capabilities.service';
import { DownloadGrantService } from '../downloads/download-grant.service';
import { getClientIp } from '@common/utils/client-context.util';
import { ApiV1Exception } from '../../common/exceptions/api-v1.exception';

const PUBLIC_RESOURCE_STATUSES = new Set(['approved', 'published']);
const MAX_PACK_ITEMS = 100;

type PackItemInput = { resource_version_public_id: string };
type ResolvedPackItem = {
  membership: ResourcePackItem;
  version: ResourceVersion;
  resource: Resource;
  file: ResourceFile;
};

@Injectable()
export class PacksService {
  constructor(
    @InjectRepository(ResourcePackItem) private readonly itemRepo: Repository<ResourcePackItem>,
    @InjectRepository(Resource) private readonly resourceRepo: Repository<Resource>,
    @InjectRepository(ResourceCategory) private readonly categoryRepo: Repository<ResourceCategory>,
    @InjectRepository(ResourceVersion) private readonly versionRepo: Repository<ResourceVersion>,
    @InjectRepository(ResourceFile) private readonly fileRepo: Repository<ResourceFile>,
    @InjectRepository(ResourceVersionDependency) private readonly dependencyRepo: Repository<ResourceVersionDependency>,
    @InjectRepository(ResourceVersionCompatibility) private readonly compatibilityRepo: Repository<ResourceVersionCompatibility>,
    private readonly dataSource: DataSource,
    private readonly capabilities: CapabilitiesService,
    private readonly downloadGrants: DownloadGrantService,
  ) {}

  async assertReadEnabled(): Promise<void> {
    const caps = await this.capabilities.getCapabilities();
    if (!caps.resources.read) throw new ApiV1Exception('RESOURCE_V1_DISABLED', HttpStatus.FORBIDDEN, 'V1 资源接口暂未启用', false);
  }

  async assertDownloadEnabled(): Promise<void> {
    const caps = await this.capabilities.getCapabilities();
    if (!caps.resources.read) throw new ApiV1Exception('RESOURCE_V1_DISABLED', HttpStatus.FORBIDDEN, 'V1 资源接口暂未启用', false);
    if (!caps.resources.download) throw new ApiV1Exception('FEATURE_DISABLED', HttpStatus.FORBIDDEN, '站点已关闭资源下载', false);
  }

  private async assertUploadEnabled(): Promise<void> {
    const caps = await this.capabilities.getCapabilities();
    if (!caps.resources.upload) throw new ApiV1Exception('RESOURCE_UPLOAD_DISABLED', HttpStatus.FORBIDDEN, '站点已关闭资源上传', false);
  }

  private async getPackVersion(packPublicId: string, versionPublicId: string, ownerUserId?: number) {
    const pack = await this.resourceRepo.findOne({ where: { public_id: packPublicId } });
    if (!pack || pack.resource_kind !== 'pack') throw new NotFoundException('Pack 不存在');
    if (ownerUserId != null && Number(pack.user_id) !== Number(ownerUserId)) throw new NotFoundException('Pack 不存在');

    const version = await this.versionRepo.findOne({
      where: { public_id: versionPublicId, resource_id: pack.id },
    });
    if (!version) throw new NotFoundException('Pack 版本不存在');
    return { pack, version };
  }

  private async assertPublicResource(resource: Resource, activeCategoryIds?: Set<number>): Promise<void> {
    if (
      Number(resource.is_public) !== 1
      || !PUBLIC_RESOURCE_STATUSES.has(resource.status || '')
      || (resource.visibility != null && resource.visibility !== 'public')
      || resource.merged_into_resource_id != null
      || !resource.public_id
    ) throw new NotFoundException('资源不存在或不可见');

    if (resource.category_id) {
      if (activeCategoryIds) {
        if (!activeCategoryIds.has(Number(resource.category_id))) throw new NotFoundException('资源不存在或不可见');
      } else {
        const category = await this.categoryRepo.findOne({ where: { id: resource.category_id } });
        if (!category || Number(category.is_active) !== 1) throw new NotFoundException('资源不存在或不可见');
      }
    }
  }

  private async resolvePinnedVersion(publicId: string): Promise<{ version: ResourceVersion; resource: Resource; file: ResourceFile }> {
    if (typeof publicId !== 'string' || !publicId.trim()) throw new BadRequestException('每项都必须指定 resource_version_public_id');
    const version = await this.versionRepo.findOne({ where: { public_id: publicId.trim(), status: 'published' } });
    if (!version || !version.public_id) throw new BadRequestException('Pack 项必须引用已发布的固定资源版本');
    const resource = await this.resourceRepo.findOne({ where: { id: version.resource_id } });
    if (!resource) throw new BadRequestException('Pack 项资源不存在');
    await this.assertPublicResource(resource);

    const files = await this.fileRepo.find({
      where: { resource_version_id: version.id, role: 'primary', availability_status: 'available' },
      order: { sort_order: 'ASC', id: 'ASC' },
    });
    const file = files.find((item) => item.public_id && this.isSha256(item.hash_algorithm, item.content_hash));
    if (!file) throw new BadRequestException('Pack 项必须包含可用且具有 SHA-256 的主文件');
    return { version, resource, file };
  }

  private isSha256(algorithm?: string | null, hash?: string | null): boolean {
    return (algorithm || '').toLowerCase() === 'sha256' && /^[a-f0-9]{64}$/i.test(hash || '');
  }

  async listItems(packPublicId: string, versionPublicId: string, ownerUserId: number) {
    await this.assertUploadEnabled();
    const { version } = await this.getPackVersion(packPublicId, versionPublicId, ownerUserId);
    const rows = await this.itemRepo.find({ where: { pack_version_id: version.id }, order: { sort_order: 'ASC', id: 'ASC' } });
    const items = await Promise.all(rows.map(async (row) => {
      const targetVersion = await this.versionRepo.findOne({ where: { id: row.member_resource_version_id } });
      const targetResource = targetVersion && await this.resourceRepo.findOne({ where: { id: targetVersion.resource_id } });
      return {
        resource_version_public_id: targetVersion?.public_id || null,
        resource_public_id: targetResource?.public_id || null,
        resource_kind: targetResource?.resource_kind || null,
        version: targetVersion?.version || null,
        sort_order: row.sort_order,
      };
    }));
    return { pack_public_id: packPublicId, pack_version_public_id: versionPublicId, items };
  }

  async replaceItems(
    packPublicId: string,
    versionPublicId: string,
    ownerUserId: number,
    items: PackItemInput[],
  ) {
    await this.assertUploadEnabled();
    if (!Array.isArray(items) || items.length > MAX_PACK_ITEMS) throw new BadRequestException(`items 必须是最多 ${MAX_PACK_ITEMS} 项的数组`);
    const { version } = await this.getPackVersion(packPublicId, versionPublicId, ownerUserId);
    if (version.status === 'published') throw new ConflictException('Pack 版本发布后成员清单不可更改');
    const ids = items.map((item) => item?.resource_version_public_id);
    if (ids.some((id) => typeof id !== 'string' || !id.trim())) throw new BadRequestException('每项都必须指定 resource_version_public_id');
    const normalizedIds = ids.map((id) => id.trim());
    if (new Set(normalizedIds).size !== normalizedIds.length) throw new BadRequestException('Pack 项不能重复');

    // Resolve and validate every exact version before replacing any existing membership.
    const pinned = await Promise.all(normalizedIds.map((id) => this.resolvePinnedVersion(id)));
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(ResourcePackItem, { pack_version_id: version.id });
      if (pinned.length) {
        await manager.insert(ResourcePackItem, pinned.map((item, index) => ({
          pack_version_id: version.id,
          member_resource_version_id: item.version.id,
          sort_order: index,
        })));
      }
    });
    return this.listItems(packPublicId, versionPublicId, ownerUserId);
  }

  private async resolvePublicManifestItems(packVersionId: number): Promise<ResolvedPackItem[]> {
    const memberships = await this.itemRepo.find({ where: { pack_version_id: packVersionId }, order: { sort_order: 'ASC', id: 'ASC' } });
    if (!memberships.length) return [];

    const memberVersionIds = [...new Set(memberships.map((membership) => Number(membership.member_resource_version_id)))];
    const versions = await this.versionRepo.find({ where: { id: In(memberVersionIds), status: 'published' } });
    const versionById = new Map(versions.map((version) => [Number(version.id), version]));
    if (memberVersionIds.some((id) => !versionById.get(id)?.public_id)) {
      throw new NotFoundException('Pack 清单包含不可用的固定版本');
    }

    const resourceIds = [...new Set(versions.map((version) => Number(version.resource_id)))];
    const resources = await this.resourceRepo.find({ where: { id: In(resourceIds) } });
    const resourceById = new Map(resources.map((resource) => [Number(resource.id), resource]));
    const memberResources = versions.map((version) => resourceById.get(Number(version.resource_id)));
    if (memberResources.some((resource) => !resource)) throw new NotFoundException('Pack 清单包含不可见资源');

    const primaryFiles = await this.fileRepo.find({
      where: {
        resource_version_id: In(memberVersionIds),
        role: 'primary',
        availability_status: 'available',
      },
      order: { sort_order: 'ASC', id: 'ASC' },
    });
    const fileByVersion = new Map<number, ResourceFile>();
    for (const file of primaryFiles) {
      if (!fileByVersion.has(Number(file.resource_version_id))
        && file.public_id && this.isSha256(file.hash_algorithm, file.content_hash)) {
        fileByVersion.set(Number(file.resource_version_id), file);
      }
    }
    if (memberVersionIds.some((id) => !fileByVersion.has(id))) {
      throw new NotFoundException('Pack 清单包含不可用的固定版本');
    }

    const dependencies = await this.dependencyRepo.find({
      where: { resource_version_id: In(memberVersionIds) },
      order: { sort_order: 'ASC', id: 'ASC' },
    });
    const dependencyTargetIds = [...new Set(dependencies
      .map((item) => Number(item.target_resource_id))
      .filter((id) => Number.isInteger(id) && id > 0))];
    const dependencyTargets = dependencyTargetIds.length
      ? await this.resourceRepo.find({ where: { id: In(dependencyTargetIds) } })
      : [];
    const categoryIds = [...new Set([...memberResources, ...dependencyTargets]
      .map((resource) => Number(resource?.category_id))
      .filter((id) => Number.isInteger(id) && id > 0))];
    const activeCategoryIds = categoryIds.length
      ? new Set((await this.categoryRepo.find({ where: { id: In(categoryIds), is_active: 1 } }))
        .filter((category) => Number(category.is_active) === 1)
        .map((category) => Number(category.id)))
      : new Set<number>();

    for (const resource of memberResources as Resource[]) await this.assertPublicResource(resource, activeCategoryIds);

    return memberships.map((membership) => {
      const version = versionById.get(Number(membership.member_resource_version_id))!;
      const resource = resourceById.get(Number(version.resource_id))!;
      return { membership, version, resource, file: fileByVersion.get(Number(version.id))! };
    });
  }

  private gameVersion(compatibilities: ResourceVersionCompatibility[]): string | null {
    const compatible = compatibilities
      .filter((item) => item.runtime === 'mindustry')
      .sort((a, b) => String(a.game_series || '').localeCompare(String(b.game_series || ''))
        || String(a.min_version_value || '').localeCompare(String(b.min_version_value || ''))
        || String(a.max_version_value || '').localeCompare(String(b.max_version_value || '')))[0];
    if (!compatible) return null;
    if (compatible.min_version_value && compatible.min_version_value === compatible.max_version_value) return compatible.min_version_value;
    if (compatible.min_version_value && compatible.max_version_value) return `${compatible.min_version_value}..${compatible.max_version_value}`;
    return compatible.min_version_value || compatible.max_version_value || compatible.game_series || null;
  }

  async getManifest(packPublicId: string, versionPublicId: string) {
    await this.assertReadEnabled();
    const { pack, version } = await this.getPackVersion(packPublicId, versionPublicId);
    await this.assertPublicResource(pack);
    if (version.status !== 'published' || !version.public_id) throw new NotFoundException('Pack 版本不存在或尚未发布');
    const items = await this.resolvePublicManifestItems(version.id);
    const [compatibilities, dependencies] = await Promise.all([
      this.compatibilityRepo.find({ where: { resource_version_id: version.id } }),
      items.length
        ? this.dependencyRepo.find({ where: items.map((item) => ({ resource_version_id: item.version.id })), order: { sort_order: 'ASC', id: 'ASC' } })
        : Promise.resolve([]),
    ]);
    const dependencyTargetIds = [...new Set(dependencies.map((item) => item.target_resource_id).filter((id): id is number => Number.isInteger(id)))];
    const targetResources = dependencyTargetIds.length
      ? await this.resourceRepo.find({ where: { id: In(dependencyTargetIds) } })
      : [];
    const targetCategoryIds = [...new Set(targetResources
      .map((resource) => Number(resource.category_id))
      .filter((id) => Number.isInteger(id) && id > 0))];
    const activeTargetCategoryIds = targetCategoryIds.length
      ? new Set((await this.categoryRepo.find({ where: { id: In(targetCategoryIds), is_active: 1 } }))
        .filter((category) => Number(category.is_active) === 1)
        .map((category) => Number(category.id)))
      : new Set<number>();
    const targetPublicIds = new Map<number, string | null>();
    targetResources.forEach((resource) => {
      let publicId: string | null = null;
      const visible = Number(resource.is_public) === 1
        && PUBLIC_RESOURCE_STATUSES.has(resource.status || '')
        && (resource.visibility == null || resource.visibility === 'public')
        && resource.merged_into_resource_id == null
        && Boolean(resource.public_id);
      if (visible && resource.category_id) {
        if (activeTargetCategoryIds.has(Number(resource.category_id))) publicId = resource.public_id;
      } else if (visible) {
        publicId = resource.public_id;
      }
      targetPublicIds.set(resource.id, publicId);
    });

    return {
      schema_version: 1,
      pack: {
        public_id: pack.public_id,
        version_public_id: version.public_id,
        version: version.version,
        game_version: this.gameVersion(compatibilities),
      },
      members: items.map(({ resource, version: memberVersion, file }) => ({
        resource_kind: resource.resource_kind || 'other',
        resource_public_id: resource.public_id,
        name: resource.title,
        version_public_id: memberVersion.public_id,
        version: memberVersion.version,
        file_name: file.original_filename || file.display_name || memberVersion.file_name || 'resource',
        size_bytes: Number(file.size_bytes ?? memberVersion.file_size ?? 0),
        sha256: file.content_hash!.toLowerCase(),
        dependencies: dependencies
          .filter((dependency) => dependency.resource_version_id === memberVersion.id)
          .map((dependency) => ({
            type: dependency.dependency_type,
            resource_public_id: dependency.target_resource_id ? targetPublicIds.get(dependency.target_resource_id) || null : null,
            external_identifier: dependency.external_identifier,
            version_constraint: dependency.version_constraint,
            notes: dependency.notes,
          })),
        download_url: `/api/v1/resources/${resource.public_id}/versions/${memberVersion.public_id}/files/${file.public_id}/download`,
      })),
    };
  }

  async createDownloadGrants(packPublicId: string, versionPublicId: string, req: any) {
    await this.assertDownloadEnabled();
    const { pack, version } = await this.getPackVersion(packPublicId, versionPublicId);
    await this.assertPublicResource(pack);
    if (version.status !== 'published' || !version.public_id) throw new NotFoundException('Pack 版本不存在或尚未发布');
    const members = await this.resolvePublicManifestItems(version.id);
    const userId = Number(req?.user?.id);
    const userAgent = String(req?.headers?.['user-agent'] || '');
    // DownloadGrantService hashes this actor key before persistence; raw IP and UA are never stored.
    const actorKey = Number.isInteger(userId) && userId > 0
      ? `user:${userId}`
      : `ipua:${getClientIp(req) || 'unknown'}:${userAgent}`;
    const grants = await Promise.all(members.map(async ({ resource, version: memberVersion, file }) => {
      const granted = await this.downloadGrants.recordGrant({
        resourceId: resource.id,
        versionId: memberVersion.id,
        fileId: file.id,
        grantedAt: new Date(),
        userId: Number.isInteger(userId) && userId > 0 ? userId : null,
        clientType: 'public-v1-pack',
        clientVersion: String(req?.headers?.['x-client-version'] || '').slice(0, 80) || null,
        platform: String(req?.headers?.['x-platform'] || '').slice(0, 40) || null,
        backend: String(file.delivery_mode || 'managed').slice(0, 32),
      }, actorKey);
      return {
        resource_public_id: resource.public_id,
        resource_version_public_id: memberVersion.public_id,
        file_public_id: file.public_id,
        download_url: `/api/v1/resources/${resource.public_id}/versions/${memberVersion.public_id}/files/${file.public_id}/download`,
        granted,
      };
    }));
    return { pack_public_id: pack.public_id, pack_version_public_id: version.public_id, grants };
  }
}
