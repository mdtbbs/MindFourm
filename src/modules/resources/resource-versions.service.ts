import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceVersion } from '@entities/resource-version.entity';
import { Resource } from '@entities/resource.entity';
import { ResourceFile } from '@entities/resource-file.entity';
import { ResourceFileMeta, ResourcesService } from './resources.service';
import { ResourceDuplicateService } from './resource-duplicate.service';
import { ResourceStorageService } from './resource-storage.service';
import { ResourceAnalysisRun, ResourceCompatibility, ResourceDependency, ResourceReviewEvent, ResourceVersionDiff } from '@entities/resource-center-v2.entity';
import { ModContent, ModIdAlias, ModLocalization, ModProfile, ModVersionMetadata } from '@entities/mod-resource-v2.entity';
import { MapAnalysis, MapCore, MapResourceEntry, MapSpawn, MapVersionMetadata, MapWaveSummary } from '@entities/map-resource-v2.entity';
import { SchematicAnalysis, SchematicBlock, SchematicMaterial, SchematicVersionMetadata } from '@entities/schematic-resource-v2.entity';
import { parseMarkdown } from '@common/utils/markdown.util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { analyzeModArchive, applyModAuthorOverrides, MOD_ARCHIVE_LIMITS, ModUploadValidationError, validateModManifest } from './analyzers/mod-package-parser';
import { validateResourceVersion } from './analyzers/version-constraint.util';
import { diffModVersion } from './analyzers/mod-content-diff';
import { persistRendererAnalysis } from './v2/resource-version-analysis.persistence';
import { diffStructuredVersion, type StructuredVersionSnapshot } from './analyzers/resource-version-diff';

@Injectable()
export class ResourceVersionService {
  constructor(
    @InjectRepository(ResourceVersion)
    private versionRepository: Repository<ResourceVersion>,
    @InjectRepository(Resource)
    private resourceRepository: Repository<Resource>,
    private readonly resourcesService: ResourcesService,
    private readonly duplicateService: ResourceDuplicateService,
    @Optional() private readonly storage?: ResourceStorageService,
  ) {}

  private async saveEntityBatches(manager: any, target: unknown, values: unknown[], batchSize = 500): Promise<void> {
    for (let offset = 0; offset < values.length; offset += batchSize) {
      await manager.save(target, values.slice(offset, offset + batchSize));
    }
  }

  private normalizeVersion(version: ResourceVersion) {
    return {
      ...version,
      file_size: version.file_size || 0,
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

  async list(resourceId: number): Promise<any[]> {
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException('资源不存在');
    }

    const versions = await this.versionRepository.find({
      where: { resource_id: resourceId },
      order: { created_at: 'DESC' },
    });

    return versions.map((version) => this.normalizeVersion(version));
  }

  async analyzeMod(file: ResourceFileMeta, authorOverrides?: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.storage) throw new BadRequestException('资源文件存储不可用');
    if (!/\.(?:jar|zip)$/i.test(file.file_name) || file.file_size > MOD_ARCHIVE_LIMITS.maxArchiveBytes) {
      throw new BadRequestException('Mod 仅支持不超过 50 MiB 的 .jar 或 .zip 文件');
    }
    try {
      const parsed = analyzeModArchive(await this.storage.readManagedFile(file.file_path, MOD_ARCHIVE_LIMITS.maxArchiveBytes));
      const manifest = applyModAuthorOverrides(parsed.manifest, authorOverrides);
      return {
        parser_version: parsed.parser_version,
        runtime_type: parsed.runtime_type,
        manifest: {
          name: manifest.name,
          display_name: manifest.displayName,
          author: manifest.author,
          version: manifest.version,
          min_game_version: manifest.minGameVersion,
          dependencies: manifest.dependencies,
          description: manifest.description,
          main: manifest.main,
          package: manifest.package,
        },
        java: parsed.java,
        content_count: parsed.content.length,
        localization_count: parsed.localizations.length,
        localizations: parsed.localizations.map(({ locale, translated, total, percentage }) => ({ locale, translated, total, percentage })),
        findings: [...parsed.findings, ...validateModManifest(manifest)],
      };
    } catch (error) {
      if (error instanceof ModUploadValidationError) throw new BadRequestException({ code: error.code, message: error.message });
      throw error;
    }
  }

  async create(
    dto: {
      resource_id: number; version: string; content?: string; version_mode?: 'semver' | 'compatibility';
      release_channel?: 'release' | 'beta' | 'alpha' | 'snapshot'; game_version_min?: string; game_version_max?: string;
      mod_id?: string; mod_author_overrides?: Record<string, unknown>;
    },
    file: ResourceFileMeta | undefined,
    userId: number,
    rendererDraft?: { metadata: Record<string, unknown> | null; parserVersion: string | null; previewKey: string | null },
  ): Promise<any> {
    if (!dto.version?.trim()) {
      throw new BadRequestException('版本号不能为空');
    }

    const versionMode = dto.version_mode || 'compatibility';
    try { validateResourceVersion(dto.version, versionMode); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : '版本号格式无效'); }

    if (!file) {
      throw new BadRequestException('版本必须包含文件');
    }

    const resource = await this.resourceRepository.findOne({
      where: { id: dto.resource_id },
    });

    if (!resource) {
      throw new NotFoundException('资源不存在');
    }

    if (resource.user_id !== userId) {
      const memberships = await this.versionRepository.manager.query(
        `SELECT u.role AS account_role, rm.role AS member_role
         FROM users u LEFT JOIN resource_members rm ON rm.resource_id = ? AND rm.user_id = u.id AND rm.status = 'active'
         WHERE u.id = ? LIMIT 1`,
        [resource.id, userId],
      ) as Array<{ account_role: string; member_role: string | null }>;
      if (memberships[0]?.account_role !== 'admin'
        && !['owner', 'maintainer', 'publisher'].includes(memberships[0]?.member_role || '')) {
        throw new ForbiddenException('没有权限为此资源添加版本');
      }
    }

    let modAnalysis: ReturnType<typeof analyzeModArchive> | null = null;
    let effectiveManifest: ReturnType<typeof applyModAuthorOverrides> | null = null;
    let nextModId: string | null = null;
    if (resource.resource_kind === 'mod') {
      if (!/\.(?:jar|zip)$/i.test(file.file_name)) throw new BadRequestException('Mod 仅支持 .jar 或 .zip 文件');
      if (!this.storage || file.file_size > MOD_ARCHIVE_LIMITS.maxArchiveBytes) throw new BadRequestException('Mod JAR/ZIP 文件超过 50 MiB 安全限制');
      try {
        modAnalysis = analyzeModArchive(await this.storage.readManagedFile(file.file_path, MOD_ARCHIVE_LIMITS.maxArchiveBytes));
      } catch (error) {
        if (error instanceof ModUploadValidationError) throw new BadRequestException({ code: error.code, message: error.message });
        throw error;
      }
      effectiveManifest = applyModAuthorOverrides(modAnalysis.manifest, dto.mod_author_overrides);
      const profile = await this.versionRepository.manager.findOne(ModProfile, { where: { resource_id: resource.id } });
      nextModId = (dto.mod_id || effectiveManifest.name || profile?.mod_id || '').trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9_.-]{0,127}$/.test(nextModId)) throw new BadRequestException('必须提供有效的 Mod ID');
    }

    const previousVersion = await this.versionRepository.findOne({
      where: { resource_id: dto.resource_id, version: dto.version.trim() },
      order: { revision: 'DESC' },
    });
    const revision = (previousVersion?.revision || 0) + 1;
    const canFastPublish = ['approved', 'published'].includes(resource.status || '');

    const duplicate = await this.duplicateService.inspect({
      contentHash: file.content_hash,
      resourceKind: resource.resource_kind,
      sourceUrl: resource.source_url,
      title: resource.title,
    });
    if (duplicate.exact) throw new ConflictException({
      code: 'RESOURCE_DUPLICATE',
      message: '这个文件已经提交过了。',
      existing_resource: duplicate.existing_resources[0],
    });

    const content = dto.content?.trim() || undefined;
    const version = this.versionRepository.create({
      resource_id: dto.resource_id,
      public_id: randomUUID(),
      version: dto.version.trim(),
      version_mode: versionMode,
      revision,
      recommended: 0,
      game_version_min: dto.game_version_min?.trim() || effectiveManifest?.minGameVersion || null,
      game_version_max: dto.game_version_max?.trim() || null,
      status: canFastPublish ? 'published' : 'pending_review',
      release_channel: dto.release_channel || 'release',
      published_at: canFastPublish ? new Date() : null,
      created_by_user_id: userId,
      release_notes_markdown: content || null,
      release_notes_html: content ? parseMarkdown(content) : null,
      file_path: file.file_path,
      file_name: file.file_name,
      file_size: file.file_size,
      mime_type: file.mime_type,
      content_hash: file.content_hash,
      content,
      content_html: content ? parseMarkdown(content) : undefined,
    });

    const saved = await this.versionRepository.manager.transaction(async (manager) => {
      await this.resourcesService.claimResourceVersionHash(manager, file.content_hash, resource.id);
      const created = await manager.save(ResourceVersion, version);
      await manager.save(ResourceFile, {
        public_id: randomUUID(),
        resource_version_id: created.id,
        role: 'primary',
        delivery_mode: 'managed',
        original_filename: file.file_name,
        mime_type: file.mime_type,
        size_bytes: file.file_size,
        hash_algorithm: 'sha256',
        content_hash: file.content_hash,
        integrity_status: 'verified',
        storage_backend: 'local',
        storage_key: file.file_path,
        external_url: null,
        availability_status: 'available',
        sort_order: 0,
      });

      if ((resource.resource_kind === 'schematic' || resource.resource_kind === 'map') && rendererDraft) {
        await persistRendererAnalysis(manager, {
          resourceId: resource.id,
          versionId: created.id,
          actorId: userId,
          kind: resource.resource_kind,
          rendererMetadata: rendererDraft.metadata,
          publisherMetadata: dto,
          previewKey: rendererDraft.previewKey,
        });
        await this.persistStructuredVersionDiff(manager, resource.id, created.id, resource.resource_kind);
      }

      let idConflict = false;
      let modProfile = resource.resource_kind === 'mod'
        ? await manager.findOne(ModProfile, { where: { resource_id: resource.id } }) : null;
      if (modAnalysis && effectiveManifest && nextModId) {
        const identifiers = [...new Set([nextModId, modProfile?.mod_id, effectiveManifest.name?.toLowerCase()].filter((id): id is string => Boolean(id)))];
        const conflicts = await manager.query(
          `SELECT resource_id FROM mod_profiles WHERE mod_id IN (${identifiers.map(() => '?').join(',')}) AND resource_id <> ?
           UNION SELECT resource_id FROM mod_id_aliases WHERE alias IN (${identifiers.map(() => '?').join(',')}) AND resource_id <> ? LIMIT 1`,
          [...identifiers, resource.id, ...identifiers, resource.id],
        );
        idConflict = Boolean(conflicts?.length);
        const changedId = Boolean(modProfile && modProfile.mod_id.toLowerCase() !== nextModId);
        const needsReview = idConflict || changedId || resource.status === 'pending';
        if (idConflict || changedId) {
          await manager.update(Resource, resource.id, { status: 'pending' });
          await manager.update(ResourceVersion, created.id, { status: 'pending_review', published_at: null, recommended: 0 });
        } else if (created.status === 'published') {
          await manager.update(ResourceVersion, created.id, { recommended: dto.release_channel === 'beta' || dto.release_channel === 'alpha' || dto.release_channel === 'snapshot' ? 0 : 1 });
          await manager.update(Resource, resource.id, { latest_published_version_id: created.id });
        }

        if (!idConflict) {
          if (modProfile) {
            if (changedId) {
              const oldAlias = modProfile.mod_id.toLowerCase();
              const aliasRows = await manager.query(
                `SELECT resource_id FROM mod_profiles WHERE mod_id = ? AND resource_id <> ?
                 UNION SELECT resource_id FROM mod_id_aliases WHERE alias = ? AND resource_id <> ? LIMIT 1`,
                [oldAlias, resource.id, oldAlias, resource.id],
              );
              if (!aliasRows?.length) await manager.query(
                'INSERT IGNORE INTO mod_id_aliases (resource_id,alias,created_by_user_id) VALUES (?,?,?)',
                [resource.id, oldAlias, userId],
              );
              else idConflict = true;
            }
            if (!idConflict) await manager.update(ModProfile, modProfile.id, {
              mod_id: nextModId,
              display_name: effectiveManifest.displayName || resource.title,
              runtime_type: modAnalysis.runtime_type === 'unknown' ? null : modAnalysis.runtime_type,
              description: effectiveManifest.description || resource.description || null,
              upstream_url: resource.source_url || null,
            });
          } else {
            await manager.save(ModProfile, manager.create(ModProfile, {
              resource_id: resource.id, mod_id: nextModId,
              display_name: effectiveManifest.displayName || resource.title,
              runtime_type: modAnalysis.runtime_type === 'unknown' ? null : modAnalysis.runtime_type,
              description: effectiveManifest.description || resource.description || null,
              upstream_url: resource.source_url || null,
            }));
          }
        }

        const declaredModId = effectiveManifest.name?.trim().toLowerCase();
        if (!idConflict && declaredModId && declaredModId !== nextModId) {
          const aliasOwner = await manager.query(
            `SELECT resource_id FROM mod_profiles WHERE mod_id = ?
             UNION SELECT resource_id FROM mod_id_aliases WHERE alias = ? LIMIT 1`,
            [declaredModId, declaredModId],
          ) as Array<{ resource_id: number }>;
          if (aliasOwner.some((row) => Number(row.resource_id) !== resource.id)) idConflict = true;
          else if (!aliasOwner.length) await manager.query(
            'INSERT IGNORE INTO mod_id_aliases (resource_id,alias,created_by_user_id) VALUES (?,?,?)',
            [resource.id, declaredModId, userId],
          );
        }

        if (idConflict || changedId) {
          await manager.update(ResourceVersion, created.id, { status: 'pending_review', published_at: null, recommended: 0 });
          await manager.update(Resource, resource.id, { status: 'pending' });
        }
        await manager.save(ModVersionMetadata, manager.create(ModVersionMetadata, {
          resource_version_id: created.id,
          parser_version: modAnalysis.parser_version,
          runtime_type: modAnalysis.runtime_type,
          manifest_name: modAnalysis.manifest.name,
          display_name: effectiveManifest.displayName,
          author: effectiveManifest.author,
          version: effectiveManifest.version || dto.version,
          min_game_version: effectiveManifest.minGameVersion,
          description: effectiveManifest.description,
          main_class: modAnalysis.java.entrypoint || effectiveManifest.main,
          package_name: effectiveManifest.package,
          parsed_manifest_json: modAnalysis.manifest.raw,
          author_overrides_json: dto.mod_author_overrides || null,
          archive_files_json: modAnalysis.files,
        }));
        if (modAnalysis.content.length) await this.saveEntityBatches(manager, ModContent, modAnalysis.content.map((item) => manager.create(ModContent, {
          public_id: randomUUID(), resource_version_id: created.id, content_type: item.content_type,
          internal_name: item.internal_name, display_name: item.display_name, description: item.description,
          icon_key: item.icon_key, properties_json: item.properties,
        })));
        if (modAnalysis.localizations.length) await this.saveEntityBatches(manager, ModLocalization, modAnalysis.localizations.map((item) => manager.create(ModLocalization, {
          resource_version_id: created.id, locale: item.locale, translated_count: item.translated,
          total_count: item.total, percentage: item.percentage, missing_keys_json: item.missing_keys,
        })));
        const dependencies = effectiveManifest.dependencies || [];
        if (dependencies.length) {
          const ids = [...new Set(dependencies.map((dependency) => dependency.mod_id.toLowerCase()))];
          const targets = await manager.query(
            `SELECT LOWER(mod_id) AS mod_id, resource_id FROM mod_profiles WHERE LOWER(mod_id) IN (${ids.map(() => '?').join(',')})
             UNION SELECT LOWER(alias) AS mod_id, resource_id FROM mod_id_aliases WHERE LOWER(alias) IN (${ids.map(() => '?').join(',')})`,
            [...ids, ...ids],
          ) as Array<{ mod_id: string; resource_id: number }>;
          const targetMap = new Map(targets.map((row) => [row.mod_id, Number(row.resource_id)]));
          await this.saveEntityBatches(manager, ResourceDependency, dependencies.map((dependency, sort_order) => manager.create(ResourceDependency, {
            resource_version_id: created.id, dependency_type: dependency.kind,
            target_resource_id: targetMap.get(dependency.mod_id.toLowerCase()) || null,
            external_identifier: dependency.mod_id, upstream_url: null,
            version_constraint: dependency.version_constraint,
            resolution_status: targetMap.has(dependency.mod_id.toLowerCase()) ? 'resolved' : 'unresolved',
            notes: null, sort_order,
          })));
        }
        if (dto.game_version_min?.trim() || dto.game_version_max?.trim() || effectiveManifest.minGameVersion) {
          await manager.save(ResourceCompatibility, manager.create(ResourceCompatibility, {
            resource_version_id: created.id,
            source: 'author', runtime: 'mindustry', platform_key: null, game_version: null,
            min_game_version: dto.game_version_min?.trim() || effectiveManifest.minGameVersion || null,
            max_game_version: dto.game_version_max?.trim() || null,
            channel: dto.release_channel || 'release', status: 'declared', confidence: null,
            notes: null, created_by_user_id: userId,
          }));
        }

        const previousPublished = await manager.query(
          `SELECT id FROM resource_versions WHERE resource_id = ? AND id <> ? AND status = 'published'
           ORDER BY COALESCE(published_at,created_at) DESC, revision DESC, id DESC LIMIT 1`,
          [resource.id, created.id],
        ) as Array<{ id: number }>;
        const previousId = Number(previousPublished[0]?.id || 0);
        if (previousId) {
          const previousMetadata = await manager.findOne(ModVersionMetadata, { where: { resource_version_id: previousId } });
          const previousContents = await manager.find(ModContent, { where: { resource_version_id: previousId } });
          const previousDependencies = await manager.find(ResourceDependency, { where: { resource_version_id: previousId } });
          const diff = diffModVersion({
            manifest: previousMetadata?.parsed_manifest_json || {},
            content: previousContents.map((item) => ({ content_type: item.content_type, internal_name: item.internal_name, display_name: item.display_name, description: item.description, properties: item.properties_json || {} })),
            dependencies: previousDependencies.map((item) => ({ mod_id: item.external_identifier || '', kind: item.dependency_type, version_constraint: item.version_constraint })),
            files: (previousMetadata?.archive_files_json || []) as Array<{ name: string; sha256: string }>,
            game_version_min: previousMetadata?.min_game_version || null,
            game_version_max: null,
          }, {
            manifest: modAnalysis.manifest.raw,
            content: modAnalysis.content,
            dependencies: effectiveManifest.dependencies,
            files: modAnalysis.files,
            game_version_min: dto.game_version_min || effectiveManifest.minGameVersion,
            game_version_max: dto.game_version_max,
          });
          await manager.save(ResourceVersionDiff, manager.create(ResourceVersionDiff, {
            resource_id: resource.id, from_version_id: previousId, to_version_id: created.id,
            diff_json: diff as unknown as Record<string, unknown>, parser_version: modAnalysis.parser_version, status: 'completed',
          }));
        }
        const findings = [...modAnalysis.findings, ...validateModManifest(effectiveManifest), ...(idConflict ? [{ code: 'mod_id_conflict', severity: 'ERROR', message: 'Mod ID or alias is already registered by another resource and requires review.' }] : [])];
        await manager.save(ResourceAnalysisRun, manager.create(ResourceAnalysisRun, {
          resource_id: resource.id, resource_version_id: created.id,
          analyzer: 'mod-static-analysis', parser_version: modAnalysis.parser_version, status: 'completed',
          summary_json: { runtime_type: modAnalysis.runtime_type, content_count: modAnalysis.content.length, localization_count: modAnalysis.localizations.length, java: modAnalysis.java },
          findings_json: findings, started_at: new Date(), completed_at: new Date(),
        }));
        if (needsReview || idConflict) await manager.save(ResourceReviewEvent, manager.create(ResourceReviewEvent, {
          resource_id: resource.id, resource_version_id: created.id, actor_user_id: userId,
          event_type: 'release_submitted', result: 'pending_review', reason: changedId
            ? 'Mod ID changed; moderator review required.'
            : idConflict ? 'Mod ID conflict requires moderator review.' : 'Resource is not currently approved or published.',
        }));
      } else if (created.status === 'published') {
        await manager.update(ResourceVersion, created.id, { recommended: dto.release_channel === 'beta' || dto.release_channel === 'alpha' || dto.release_channel === 'snapshot' ? 0 : 1 });
        await manager.update(Resource, resource.id, { latest_published_version_id: created.id });
      } else {
        await manager.save(ResourceReviewEvent, manager.create(ResourceReviewEvent, {
          resource_id: resource.id, resource_version_id: created.id, actor_user_id: userId,
          event_type: 'release_submitted', result: 'pending_review', reason: 'Resource is not currently approved or published.',
        }));
      }
      return created;
    });
    return this.normalizeVersion(saved);
  }

  private async persistStructuredVersionDiff(manager: any, resourceId: number, targetVersionId: number, kind: 'schematic' | 'map'): Promise<void> {
    const previousRows = await manager.query(
      `SELECT id FROM resource_versions WHERE resource_id = ? AND id <> ? AND status = 'published'
       ORDER BY COALESCE(published_at,created_at) DESC, revision DESC, id DESC LIMIT 1`,
      [resourceId, targetVersionId],
    ) as Array<{ id: number }>;
    const fromVersionId = Number(previousRows[0]?.id || 0);
    if (!fromVersionId) return;

    let before: StructuredVersionSnapshot;
    let after: StructuredVersionSnapshot;
    let parserVersion = kind === 'map' ? 'mdtbbs-map-metadata-1' : 'mdtbbs-schematic-metadata-1';
    if (kind === 'schematic') {
      const [oldMetadata, newMetadata, oldAnalysis, newAnalysis, oldBlocks, newBlocks, oldMaterials, newMaterials, oldDependencies, newDependencies] = await Promise.all([
        manager.findOne(SchematicVersionMetadata, { where: { resource_version_id: fromVersionId } }),
        manager.findOne(SchematicVersionMetadata, { where: { resource_version_id: targetVersionId } }),
        manager.findOne(SchematicAnalysis, { where: { resource_version_id: fromVersionId } }),
        manager.findOne(SchematicAnalysis, { where: { resource_version_id: targetVersionId } }),
        manager.find(SchematicBlock, { where: { resource_version_id: fromVersionId }, order: { internal_name: 'ASC' } }),
        manager.find(SchematicBlock, { where: { resource_version_id: targetVersionId }, order: { internal_name: 'ASC' } }),
        manager.find(SchematicMaterial, { where: { resource_version_id: fromVersionId }, order: { internal_name: 'ASC' } }),
        manager.find(SchematicMaterial, { where: { resource_version_id: targetVersionId }, order: { internal_name: 'ASC' } }),
        manager.find(ResourceDependency, { where: { resource_version_id: fromVersionId }, order: { sort_order: 'ASC' } }),
        manager.find(ResourceDependency, { where: { resource_version_id: targetVersionId }, order: { sort_order: 'ASC' } }),
      ]);
      if (!newMetadata) return;
      parserVersion = String(newMetadata.parser_version || parserVersion);
      const metadataSnapshot = (row: any) => row ? ({
        width: row.width, height: row.height, block_count: row.block_count,
        content_hash: row.content_hash, structure_hash: row.structure_hash,
        normalized_structure_hash: row.normalized_structure_hash,
        min_supported_build: row.min_supported_build,
        schematic_format_version: row.schematic_format_version,
      }) : null;
      const analysisSnapshot = (row: any, blocks: any[]) => row ? ({
        production_json: row.production_json,
        bottlenecks_json: row.bottlenecks_json,
        logic_processor_count: blocks.filter(block => /processor|logic/.test(String(block.internal_name))).reduce((sum, block) => sum + Number(block.count || 0), 0),
      }) : null;
      const blockSnapshot = (rows: any[]) => rows.map(row => ({
        internal_name: String(row.internal_name), display_name: row.display_name || null,
        count: Number(row.count || 0),
      }));
      const materialSnapshot = (rows: any[]) => rows.map(row => ({ internal_name: String(row.internal_name), amount: Number(row.amount || 0) }));
      const dependencySnapshot = (rows: any[]) => rows.map(row => `${row.dependency_type || 'required'}:${row.external_identifier || ''}${row.version_constraint ? `@${row.version_constraint}` : ''}`).filter(value => value !== 'required:');
      before = {
        metadata: metadataSnapshot(oldMetadata), analysis: analysisSnapshot(oldAnalysis, oldBlocks),
        blocks: blockSnapshot(oldBlocks), materials: materialSnapshot(oldMaterials), dependencies: dependencySnapshot(oldDependencies),
      };
      after = {
        metadata: metadataSnapshot(newMetadata), analysis: analysisSnapshot(newAnalysis, newBlocks),
        blocks: blockSnapshot(newBlocks), materials: materialSnapshot(newMaterials), dependencies: dependencySnapshot(newDependencies),
      };
    } else {
      const [oldMetadata, newMetadata, oldAnalysis, newAnalysis, oldResources, newResources, oldCores, newCores, oldSpawns, newSpawns, oldWaves, newWaves, oldDependencies, newDependencies] = await Promise.all([
        manager.findOne(MapVersionMetadata, { where: { resource_version_id: fromVersionId } }),
        manager.findOne(MapVersionMetadata, { where: { resource_version_id: targetVersionId } }),
        manager.findOne(MapAnalysis, { where: { resource_version_id: fromVersionId } }),
        manager.findOne(MapAnalysis, { where: { resource_version_id: targetVersionId } }),
        manager.find(MapResourceEntry, { where: { resource_version_id: fromVersionId }, order: { resource_type: 'ASC', internal_name: 'ASC' } }),
        manager.find(MapResourceEntry, { where: { resource_version_id: targetVersionId }, order: { resource_type: 'ASC', internal_name: 'ASC' } }),
        manager.find(MapCore, { where: { resource_version_id: fromVersionId }, order: { x: 'ASC', y: 'ASC' } }),
        manager.find(MapCore, { where: { resource_version_id: targetVersionId }, order: { x: 'ASC', y: 'ASC' } }),
        manager.find(MapSpawn, { where: { resource_version_id: fromVersionId }, order: { x: 'ASC', y: 'ASC' } }),
        manager.find(MapSpawn, { where: { resource_version_id: targetVersionId }, order: { x: 'ASC', y: 'ASC' } }),
        manager.find(MapWaveSummary, { where: { resource_version_id: fromVersionId }, order: { wave_start: 'ASC', wave_end: 'ASC' } }),
        manager.find(MapWaveSummary, { where: { resource_version_id: targetVersionId }, order: { wave_start: 'ASC', wave_end: 'ASC' } }),
        manager.find(ResourceDependency, { where: { resource_version_id: fromVersionId }, order: { sort_order: 'ASC' } }),
        manager.find(ResourceDependency, { where: { resource_version_id: targetVersionId }, order: { sort_order: 'ASC' } }),
      ]);
      if (!newMetadata) return;
      parserVersion = String(newMetadata.parser_version || parserVersion);
      const metadataSnapshot = (row: any) => row ? ({
        width: row.width, height: row.height, game_mode: row.game_mode,
        game_modes_json: row.game_modes_json, planet: row.planet,
        player_count: row.player_count, playtime_seconds: row.playtime_seconds,
        game_version_min: row.game_version_min, game_version_max: row.game_version_max,
        rules_json: row.rules_json,
      }) : null;
      const analysisSnapshot = (row: any) => row ? ({
        estimated_difficulty: row.estimated_difficulty,
        difficulty_confidence: row.difficulty_confidence,
        resource_balance_json: row.resource_balance_json,
        path_analysis_json: row.path_analysis_json,
        warnings_json: row.warnings_json,
        estimated: true,
      }) : null;
      const resourceSnapshot = (rows: any[]) => rows.map(row => ({
        resource_type: String(row.resource_type), internal_name: String(row.internal_name),
        amount: row.amount == null ? null : Number(row.amount), distribution_json: row.distribution_json || null,
      }));
      const coreSnapshot = (rows: any[]) => rows.map(row => ({ core_type: row.core_type || null, team: row.team || null, x: row.x, y: row.y }));
      const spawnSnapshot = (rows: any[]) => rows.map(row => ({ spawn_type: row.spawn_type, team: row.team || null, x: row.x, y: row.y, wave: row.wave }));
      const waveSnapshot = (rows: any[]) => rows.map(row => ({
        wave_start: Number(row.wave_start), wave_end: Number(row.wave_end), enemy_count: row.enemy_count,
        estimated_health: row.estimated_health, air_ratio: row.air_ratio, boss_count: Number(row.boss_count || 0),
        strength: row.strength, is_spike: Boolean(row.is_spike), details_json: row.details_json || null,
      }));
      const dependencySnapshot = (rows: any[]) => rows.map(row => `${row.dependency_type || 'required'}:${row.external_identifier || ''}${row.version_constraint ? `@${row.version_constraint}` : ''}`).filter(value => value !== 'required:');
      before = {
        metadata: metadataSnapshot(oldMetadata), analysis: analysisSnapshot(oldAnalysis),
        resources: resourceSnapshot(oldResources), cores: coreSnapshot(oldCores), spawns: spawnSnapshot(oldSpawns),
        waves: waveSnapshot(oldWaves), dependencies: dependencySnapshot(oldDependencies),
      };
      after = {
        metadata: metadataSnapshot(newMetadata), analysis: analysisSnapshot(newAnalysis),
        resources: resourceSnapshot(newResources), cores: coreSnapshot(newCores), spawns: spawnSnapshot(newSpawns),
        waves: waveSnapshot(newWaves), dependencies: dependencySnapshot(newDependencies),
      };
    }

    const diff = diffStructuredVersion(kind, before, after);
    await manager.save(ResourceVersionDiff, manager.create(ResourceVersionDiff, {
      resource_id: resourceId,
      from_version_id: fromVersionId,
      to_version_id: targetVersionId,
      diff_json: diff as unknown as Record<string, unknown>,
      parser_version: parserVersion,
      status: 'completed',
    }));
  }

  async getDownloadTarget(resourceId: number, versionId: number): Promise<ResourceVersion> {
    const version = await this.versionRepository.findOne({
      where: { id: versionId, resource_id: resourceId },
    });

    if (!version) {
      throw new NotFoundException('版本不存在');
    }

    return version;
  }

  async delete(id: number, resourceId: number, userId: number): Promise<void> {
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException('资源不存在');
    }

    if (resource.user_id !== userId) {
      throw new ForbiddenException('没有权限删除此资源的版本');
    }

    const version = await this.versionRepository.findOne({
      where: { id, resource_id: resourceId },
    });

    if (!version) {
      throw new NotFoundException('版本不存在');
    }

    await this.deleteStoredFile(version.file_path);
    await this.versionRepository.delete(id);
    if (version.content_hash) await this.resourcesService.releaseContentHashClaim(version.content_hash);
  }
}
