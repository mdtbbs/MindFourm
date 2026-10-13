import { EntityManager } from 'typeorm';
import {
  ResourceAnalysisRun,
  ResourceCompatibility,
  ResourceDependency,
} from '@entities/resource-center-v2.entity';
import {
  MapAnalysis,
  MapCore,
  MapResourceEntry,
  MapSpawn,
  MapVersionMetadata,
  MapWaveSummary,
} from '@entities/map-resource-v2.entity';
import {
  SchematicAnalysis,
  SchematicBlock,
  SchematicLogicProcessor,
  SchematicMaterial,
  SchematicVersionMetadata,
} from '@entities/schematic-resource-v2.entity';
import { analyzeMapMetadata } from '../analyzers/map-analyzer';
import { analyzeSchematicMetadata } from '../analyzers/schematic-analyzer';

export type StructuredResourceKind = 'map' | 'schematic';

export type PersistRendererAnalysisInput = {
  resourceId: number;
  versionId: number;
  actorId: number;
  kind: StructuredResourceKind;
  rendererMetadata: unknown;
  publisherMetadata?: unknown;
  previewKey?: string | null;
};

/** Persists bounded renderer output as version-scoped, queryable records. */
export async function persistRendererAnalysis(manager: EntityManager, input: PersistRendererAnalysisInput) {
  if (input.kind === 'schematic') {
    const result = analyzeSchematicMetadata(input.rendererMetadata, input.publisherMetadata);
    await manager.save(SchematicVersionMetadata, manager.create(SchematicVersionMetadata, {
      resource_version_id: input.versionId,
      ...result.metadata,
      preview_key: input.previewKey || null,
    } as Partial<SchematicVersionMetadata>));
    if (result.blocks.length) await manager.save(SchematicBlock, result.blocks.map(item => manager.create(SchematicBlock, {
      resource_version_id: input.versionId, ...item,
    })));
    if (result.materials.length) await manager.save(SchematicMaterial, result.materials.map(item => manager.create(SchematicMaterial, {
      resource_version_id: input.versionId, ...item,
    })));
    if (result.logic_processors.length) await manager.save(SchematicLogicProcessor, result.logic_processors.map(item => manager.create(SchematicLogicProcessor, {
      resource_version_id: input.versionId, ...item,
    })));
    await manager.save(SchematicAnalysis, manager.create(SchematicAnalysis, {
      resource_version_id: input.versionId,
      parser_version: result.analysis.parser_version,
      status: result.analysis.status,
      complete: result.analysis.complete ? 1 : 0,
      available: result.analysis.available ? 1 : 0,
      estimated: 1,
      production_json: result.analysis.production_json,
      bottlenecks_json: result.analysis.bottlenecks_json,
      warnings_json: result.analysis.warnings_json,
    }));
    await persistDependencies(manager, input, result.metadata.dependencies_json);
    await manager.save(ResourceAnalysisRun, manager.create(ResourceAnalysisRun, {
      resource_id: input.resourceId,
      resource_version_id: input.versionId,
      analyzer: 'schematic-static-analysis',
      parser_version: result.parser_version,
      status: result.analysis.status,
      summary_json: {
        width: result.metadata.width,
        height: result.metadata.height,
        block_count: result.metadata.block_count,
        production_estimated: true,
        logic_processor_count: result.logic_processors.length,
      },
      findings_json: normalizeFindingSeverity(result.analysis.warnings_json),
      started_at: new Date(),
      completed_at: new Date(),
    }));
    return { parser_version: result.parser_version, analysis: result.analysis, findings: result.analysis.warnings_json };
  }

  const result = analyzeMapMetadata(input.rendererMetadata, input.publisherMetadata);
  await manager.save(MapVersionMetadata, manager.create(MapVersionMetadata, {
    resource_version_id: input.versionId,
    ...result.metadata,
    preview_key: input.previewKey || null,
  } as Partial<MapVersionMetadata>));
  if (result.resources.length) await manager.save(MapResourceEntry, result.resources.map(item => manager.create(MapResourceEntry, {
    resource_version_id: input.versionId, ...item,
  })));
  if (result.spawns.length) await manager.save(MapSpawn, result.spawns.map(item => manager.create(MapSpawn, {
    resource_version_id: input.versionId, ...item,
  })));
  if (result.cores.length) await manager.save(MapCore, result.cores.map(item => manager.create(MapCore, {
    resource_version_id: input.versionId, ...item,
  })));
  if (result.waves.length) await manager.save(MapWaveSummary, result.waves.map(item => manager.create(MapWaveSummary, {
    resource_version_id: input.versionId,
    ...item,
    is_spike: item.is_spike ? 1 : 0,
  })));
  await manager.save(MapAnalysis, manager.create(MapAnalysis, {
    resource_version_id: input.versionId,
    parser_version: result.analysis.parser_version,
    status: result.analysis.status,
    difficulty_confidence: result.analysis.difficulty_confidence,
    estimated_difficulty: result.analysis.estimated_difficulty,
    resource_balance_json: result.analysis.resource_balance_json,
    path_analysis_json: result.analysis.path_analysis_json,
    warnings_json: result.analysis.warnings_json,
  }));
  // Renderer output and the author declaration are independent evidence sources and
  // are merged here; an empty renderer list must not mask the author's Mods.
  await persistDependencies(manager, input,
    result.metadata.source_renderer_metadata_json.mod_dependencies,
    result.metadata.source_metadata_json?.required_mods,
    result.metadata.source_metadata_json?.dependencies);
  if (result.metadata.game_version_min || result.metadata.game_version_max) {
    await manager.save(ResourceCompatibility, manager.create(ResourceCompatibility, {
      resource_version_id: input.versionId,
      source: 'author',
      runtime: 'mindustry',
      platform_key: null,
      game_version: null,
      min_game_version: result.metadata.game_version_min,
      max_game_version: result.metadata.game_version_max,
      channel: null,
      status: 'declared',
      confidence: null,
      notes: null,
      created_by_user_id: input.actorId,
    }));
  }
  await manager.save(ResourceAnalysisRun, manager.create(ResourceAnalysisRun, {
    resource_id: input.resourceId,
    resource_version_id: input.versionId,
    analyzer: 'map-static-analysis',
    parser_version: result.parser_version,
    status: result.analysis.status,
    summary_json: {
      width: result.metadata.width,
      height: result.metadata.height,
      mode: result.metadata.game_mode,
      resource_entries: result.resources.length,
      spawn_count: result.spawns.length,
      core_count: result.cores.length,
      wave_group_count: result.waves.length,
      estimated_difficulty: result.analysis.estimated_difficulty,
      difficulty_confidence: result.analysis.difficulty_confidence,
    },
    findings_json: normalizeFindingSeverity(result.analysis.warnings_json),
    started_at: new Date(),
    completed_at: new Date(),
  }));
  return { parser_version: result.parser_version, analysis: result.analysis, findings: result.analysis.warnings_json };
}

async function persistDependencies(manager: EntityManager, input: PersistRendererAnalysisInput, ...sources: unknown[]): Promise<void> {
  const identifiers = normalizeDependencies(...sources);
  if (!identifiers.length) return;
  const ids = [...new Set(identifiers.map(item => item.toLowerCase()))];
  const placeholders = ids.map(() => '?').join(',');
  // `canonical` marks the profile name so two spellings of one Mod collapse onto it.
  const targets = await manager.query(
    `SELECT LOWER(mod_id) AS mod_id, resource_id, 1 AS canonical FROM mod_profiles WHERE LOWER(mod_id) IN (${placeholders})
     UNION SELECT LOWER(alias) AS mod_id, resource_id, 0 AS canonical FROM mod_id_aliases WHERE LOWER(alias) IN (${placeholders})`,
    [...ids, ...ids],
  ) as Array<{ mod_id: string; resource_id: number; canonical: number | boolean }>;
  const targetMap = new Map<string, number>();
  const canonicalByResource = new Map<number, string>();
  for (const row of targets) {
    const resourceId = Number(row.resource_id);
    targetMap.set(String(row.mod_id), resourceId);
    if (Number(row.canonical) === 1) canonicalByResource.set(resourceId, String(row.mod_id));
  }
  // One record per resolved Mod and per unresolved identifier, in first-seen order.
  const dependencies: Array<{ identifier: string; targetResourceId: number | null }> = [];
  const indexByKey = new Map<string, number>();
  for (const identifier of identifiers) {
    const targetResourceId = targetMap.get(identifier.toLowerCase()) ?? null;
    const key = targetResourceId === null ? `unresolved:${identifier.toLowerCase()}` : `resolved:${targetResourceId}`;
    const seen = indexByKey.get(key);
    if (seen === undefined) {
      indexByKey.set(key, dependencies.length);
      dependencies.push({ identifier, targetResourceId });
      continue;
    }
    const canonical = targetResourceId === null ? null : canonicalByResource.get(targetResourceId) ?? null;
    if (canonical && identifier.toLowerCase() === canonical && dependencies[seen].identifier.toLowerCase() !== canonical) {
      dependencies[seen].identifier = identifier;
    }
  }
  await manager.save(ResourceDependency, dependencies.map((dependency, sort_order) => manager.create(ResourceDependency, {
    resource_version_id: input.versionId,
    dependency_type: 'required',
    target_resource_id: dependency.targetResourceId,
    external_identifier: dependency.identifier,
    upstream_url: null,
    version_constraint: null,
    resolution_status: dependency.targetResourceId === null ? 'unresolved' : 'resolved',
    notes: null,
    sort_order,
  })));
}

function normalizeDependencies(...sources: unknown[]): string[] {
  const values: unknown[] = [];
  for (const source of sources) {
    if (Array.isArray(source)) values.push(...source);
    else if (typeof source === 'string') values.push(...source.split(/[\s,]+/));
  }
  return [...new Set(values.map(item => {
    if (typeof item === 'string') return item.trim().slice(0, 255);
    if (!item || typeof item !== 'object') return '';
    const row = item as Record<string, unknown>;
    const name = row.mod_id ?? row.name ?? row.id;
    return typeof name === 'string' ? name.trim().slice(0, 255) : '';
  }).filter(item => /^[A-Za-z0-9_.-]+$/.test(item)))].slice(0, 500);
}

function normalizeFindingSeverity(findings: Array<{ severity: string; [key: string]: unknown }>): Array<Record<string, unknown>> {
  return findings.map(item => ({ ...item, severity: item.severity.toUpperCase() }));
}
