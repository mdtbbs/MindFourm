import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { ResourceFile } from '@entities/resource-file.entity';

export const RESOURCE_DUPLICATE_STATUSES = ['pending', 'pending_review', 'approved', 'published'];

export type ResourceDuplicateResult = {
  exact: boolean;
  structure: boolean;
  normalized: boolean;
  existing_resources: Array<{ id: number | null; public_id: string | null; title: string; status: string; url: string }>;
  similar_resources?: Array<{ id: number | null; public_id: string | null; title: string; status: string; url: string }>;
};

@Injectable()
export class ResourceDuplicateService {
  constructor(
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @Optional() @InjectRepository(ResourceVersion) private readonly versions?: Repository<ResourceVersion>,
    @Optional() @InjectRepository(ResourceFile) private readonly files?: Repository<ResourceFile>,
  ) {}

  async inspect(input: {
    contentHash?: string | null;
    structureHash?: string | null;
    normalizedStructureHash?: string | null;
    resourceKind?: string | null;
    sourceUrl?: string | null;
    title?: string | null;
  }): Promise<ResourceDuplicateResult> {
    const fingerprintRows = async (field: 'content_hash' | 'structure_hash' | 'normalized_structure_hash', value?: string | null) => {
      if (!value) return [] as Resource[];
      return this.resources.find({
        where: { [field]: value, status: In(RESOURCE_DUPLICATE_STATUSES) } as any,
        select: ['id', 'public_id', 'title', 'status', 'is_public', 'deleted_at', 'merged_into_resource_id', 'content_hash', 'structure_hash', 'normalized_structure_hash', 'resource_kind', 'category_id'],
        relations: ['category'],
        order: { id: 'ASC' },
        take: 20,
      });
    };
    const [fileRows, exactStructureRows, normalizedStructureRows] = await Promise.all([
      fingerprintRows('content_hash', input.contentHash),
      fingerprintRows('structure_hash', input.structureHash),
      fingerprintRows('normalized_structure_hash', input.normalizedStructureHash),
    ]);
    const active = (rows: Resource[]) => rows.filter((row) => !row.deleted_at && !row.merged_into_resource_id);
    const exactResourceRows = active(fileRows);
    let versionResourceRows: Resource[] = [];
    if (input.contentHash && this.versions) {
      const matches = await this.versions.createQueryBuilder('version')
        .innerJoinAndSelect('version.resource', 'resource')
        .leftJoinAndSelect('resource.category', 'category')
        .where('version.content_hash = :contentHash', { contentHash: input.contentHash })
        .andWhere('resource.status IN (:...statuses)', { statuses: RESOURCE_DUPLICATE_STATUSES })
        .andWhere('resource.deleted_at IS NULL')
        .andWhere('resource.merged_into_resource_id IS NULL')
        .andWhere('(version.status IS NULL OR version.status IN (:...versionStatuses))', { versionStatuses: ['pending', 'pending_review', 'published'] })
        .select(['version.id', 'version.resource_id', 'version.content_hash', 'version.status', 'resource.id', 'resource.public_id', 'resource.title', 'resource.status', 'resource.is_public', 'resource.category_id', 'category.id', 'category.is_active'])
        .orderBy('resource.id', 'ASC').take(20).getMany();
      versionResourceRows = matches.map((version) => version.resource).filter(Boolean);
    }
    let fileResourceRows: Resource[] = [];
    if (input.contentHash && this.files) {
      const matches = await this.files.createQueryBuilder('file')
        .innerJoinAndSelect('file.resource_version', 'version')
        .innerJoinAndSelect('version.resource', 'resource')
        .leftJoinAndSelect('resource.category', 'category')
        .where('file.content_hash = :contentHash', { contentHash: input.contentHash })
        .andWhere('file.availability_status = :available', { available: 'available' })
        .andWhere('resource.status IN (:...statuses)', { statuses: RESOURCE_DUPLICATE_STATUSES })
        .andWhere('resource.deleted_at IS NULL')
        .andWhere('resource.merged_into_resource_id IS NULL')
        .andWhere('(version.status IS NULL OR version.status IN (:...versionStatuses))', { versionStatuses: ['pending', 'pending_review', 'published'] })
        .select(['file.id', 'file.resource_version_id', 'file.content_hash', 'version.id', 'version.resource_id', 'version.status', 'resource.id', 'resource.public_id', 'resource.title', 'resource.status', 'resource.is_public', 'resource.category_id', 'category.id', 'category.is_active'])
        .orderBy('resource.id', 'ASC').take(20).getMany();
      fileResourceRows = matches.map((file) => file.resource_version?.resource).filter(Boolean);
    }
    const exactRows = [...exactResourceRows, ...versionResourceRows, ...fileResourceRows];
    const structureRows = active(exactStructureRows);
    const normalizedRows = active(normalizedStructureRows);
    const union = new Map<number, Resource>();
    [...exactRows, ...structureRows, ...normalizedRows].forEach((row) => union.set(row.id, row));

    let similarRows: Resource[] = [];
    if (input.resourceKind === 'mod' && (input.sourceUrl || input.title)) {
      const qb = this.resources.createQueryBuilder('resource')
        .where('resource.resource_kind = :kind', { kind: 'mod' })
        .andWhere('resource.status IN (:...statuses)', { statuses: RESOURCE_DUPLICATE_STATUSES })
        .andWhere('resource.deleted_at IS NULL')
        .andWhere('resource.merged_into_resource_id IS NULL');
      if (input.sourceUrl) qb.andWhere('resource.source_url = :sourceUrl', { sourceUrl: input.sourceUrl });
      else qb.andWhere('resource.title = :title', { title: input.title?.trim() });
      similarRows = await qb.leftJoinAndSelect('resource.category', 'category')
        .select(['resource.id', 'resource.public_id', 'resource.title', 'resource.status', 'resource.is_public', 'resource.category_id'])
        .addSelect(['category.id', 'category.is_active'])
        .orderBy('resource.id', 'ASC').take(6).getMany();
    }

    const toPublic = (row: Resource) => Number(row.is_public) === 1
      && (!row.category_id || Number(row.category?.is_active) === 1)
      && ['approved', 'published'].includes(row.status)
      ? { id: row.id, public_id: row.public_id || null, title: row.title, status: row.status, url: `/resources/${row.id}` }
      : { id: null, public_id: null, title: '已有资源正在审核或不可见', status: 'pending', url: '/resources' };
    return {
      exact: exactRows.length > 0,
      structure: structureRows.length > 0,
      normalized: normalizedRows.length > 0,
      existing_resources: [...union.values()].map(toPublic),
      ...(similarRows.length ? { similar_resources: similarRows.map(toPublic) } : {}),
    };
  }

  async findExact(contentHash: string): Promise<Resource | null> {
    return this.resources.createQueryBuilder('resource')
      .where('resource.content_hash = :contentHash', { contentHash })
      .andWhere('resource.status IN (:...statuses)', { statuses: RESOURCE_DUPLICATE_STATUSES })
      .andWhere('resource.deleted_at IS NULL')
      .andWhere('resource.merged_into_resource_id IS NULL')
      .orderBy('resource.id', 'ASC')
      .getOne();
  }
}
