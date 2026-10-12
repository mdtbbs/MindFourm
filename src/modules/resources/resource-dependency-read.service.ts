import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Shared read-side projection for resource dependencies and compatibilities.
 *
 * Modern tables (resource_dependencies / resource_compatibilities) take
 * precedence; legacy rows (resource_version_dependencies /
 * resource_version_compatibilities) are merged in when the modern table is
 * missing or lacks a copy of that legacy row (matched via legacy_source_id).
 * This keeps modern-only, legacy-only and mixed datasets consistent across
 * V2, V1 Manifest, Search and Pack readers. Read-only: no writes, no schema
 * assumptions beyond the columns already produced by the V2 migration.
 */

export type ResourceDependencyKind = 'required' | 'optional' | 'incompatible' | 'embedded';

export type UnifiedDependency = {
  resource_version_id: number;
  dependency_type: ResourceDependencyKind;
  target_resource_id: number | null;
  /** public_id only when the target resource is publicly visible, else null. */
  target_public_id: string | null;
  external_identifier: string | null;
  upstream_url: string | null;
  version_constraint: string | null;
  resolution_status: string | null;
  notes: string | null;
  sort_order: number;
  source: 'modern' | 'legacy';
};

export type UnifiedCompatibility = {
  resource_version_id: number;
  runtime: string;
  game_version: string | null;
  min_version: string | null;
  max_version: string | null;
  channel: string | null;
  platform_key: string | null;
  status: string | null;
  source: string | null;
  confidence: string | null;
  notes: string | null;
  origin: 'modern' | 'legacy';
};

const DEPENDENCY_KINDS = new Set<ResourceDependencyKind>(['required', 'optional', 'incompatible', 'embedded']);

const TARGET_PUBLIC_ID_CASE = `CASE WHEN target.is_public = 1 AND target.deleted_at IS NULL
  AND target.status IN ('approved','published')
  AND (target.visibility IS NULL OR target.visibility = 'public')
  AND target.merged_into_resource_id IS NULL
  THEN target.public_id ELSE NULL END AS target_public_id`;

@Injectable()
export class ResourceDependencyReadService {
  private readonly tableAvailability = new Map<string, Promise<boolean>>();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async tableExists(table: string): Promise<boolean> {
    let pending = this.tableAvailability.get(table);
    if (!pending) {
      pending = this.dataSource.query(
        'SELECT 1 AS present FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1',
        [table],
      ).then((rows: unknown[]) => rows.length > 0);
      this.tableAvailability.set(table, pending);
    }
    return pending;
  }

  async collectDependencies(versionIds: number[]): Promise<Map<number, UnifiedDependency[]>> {
    const map = new Map<number, UnifiedDependency[]>();
    if (!versionIds.length) return map;
    const placeholders = versionIds.map(() => '?').join(',');
    const rows: UnifiedDependency[] = [];

    if (await this.tableExists('resource_dependencies')) {
      const modern = await this.dataSource.query(
        `SELECT d.*, ${TARGET_PUBLIC_ID_CASE} FROM resource_dependencies d
         LEFT JOIN resources target ON target.id = d.target_resource_id
         WHERE d.resource_version_id IN (${placeholders}) ORDER BY d.sort_order ASC, d.id ASC`,
        versionIds,
      );
      for (const row of modern as Record<string, unknown>[]) {
        rows.push({
          resource_version_id: Number(row.resource_version_id),
          dependency_type: this.normalizeKind(row.dependency_type),
          target_resource_id: this.intOrNull(row.target_resource_id),
          target_public_id: typeof row.target_public_id === 'string' ? row.target_public_id : null,
          external_identifier: (row.external_identifier as string) || null,
          upstream_url: (row.upstream_url as string) || null,
          version_constraint: (row.version_constraint as string) || null,
          resolution_status: (row.resolution_status as string) || null,
          notes: (row.notes as string) || null,
          sort_order: Number(row.sort_order) || 0,
          source: 'modern',
        });
      }
    }

    if (await this.tableExists('resource_version_dependencies')) {
      // Modern rows already copied from legacy carry legacy_source_id; skip
      // those legacy rows so mixed datasets do not duplicate a relationship.
      const hasModern = await this.tableExists('resource_dependencies');
      const legacy = await this.dataSource.query(
        `SELECT d.*, ${TARGET_PUBLIC_ID_CASE} FROM resource_version_dependencies d
         LEFT JOIN resources target ON target.id = d.target_resource_id
         WHERE d.resource_version_id IN (${placeholders})
         ${hasModern ? `AND NOT EXISTS (
           SELECT 1 FROM resource_dependencies copied
           WHERE copied.legacy_source_id = d.id)` : ''}
         ORDER BY d.sort_order ASC, d.id ASC`,
        versionIds,
      );
      for (const row of legacy as Record<string, unknown>[]) {
        rows.push({
          resource_version_id: Number(row.resource_version_id),
          dependency_type: this.normalizeKind(row.dependency_type),
          target_resource_id: this.intOrNull(row.target_resource_id),
          target_public_id: typeof row.target_public_id === 'string' ? row.target_public_id : null,
          external_identifier: (row.external_identifier as string) || null,
          upstream_url: null,
          version_constraint: (row.version_constraint as string) || null,
          resolution_status: null,
          notes: (row.notes as string) || null,
          sort_order: Number(row.sort_order) || 0,
          source: 'legacy',
        });
      }
    }

    rows.sort((a, b) => a.sort_order - b.sort_order);
    for (const row of rows) {
      const list = map.get(row.resource_version_id) || [];
      list.push(row);
      map.set(row.resource_version_id, list);
    }
    return map;
  }

  async collectCompatibilities(versionIds: number[]): Promise<Map<number, UnifiedCompatibility[]>> {
    const map = new Map<number, UnifiedCompatibility[]>();
    if (!versionIds.length) return map;
    const placeholders = versionIds.map(() => '?').join(',');
    const rows: UnifiedCompatibility[] = [];

    if (await this.tableExists('resource_compatibilities')) {
      const modern = await this.dataSource.query(
        `SELECT * FROM resource_compatibilities WHERE resource_version_id IN (${placeholders}) ORDER BY id ASC`,
        versionIds,
      );
      for (const row of modern as Record<string, unknown>[]) {
        rows.push({
          resource_version_id: Number(row.resource_version_id),
          runtime: String(row.runtime || 'mindustry'),
          game_version: (row.game_version as string) || null,
          min_version: (row.min_game_version as string) || null,
          max_version: (row.max_game_version as string) || null,
          channel: (row.channel as string) || null,
          platform_key: (row.platform_key as string) || null,
          status: (row.status as string) || null,
          source: (row.source as string) || null,
          confidence: (row.confidence as string) || null,
          notes: (row.notes as string) || null,
          origin: 'modern',
        });
      }
    }

    if (await this.tableExists('resource_version_compatibilities')) {
      const hasModern = await this.tableExists('resource_compatibilities');
      const legacy = await this.dataSource.query(
        `SELECT * FROM resource_version_compatibilities d
         WHERE d.resource_version_id IN (${placeholders})
         ${hasModern ? `AND NOT EXISTS (
           SELECT 1 FROM resource_compatibilities copied
           WHERE copied.legacy_source_id = d.id)` : ''}
         ORDER BY d.id ASC`,
        versionIds,
      );
      for (const row of legacy as Record<string, unknown>[]) {
        rows.push({
          resource_version_id: Number(row.resource_version_id),
          runtime: String(row.runtime || 'mindustry'),
          game_version: (row.game_series as string) || null,
          min_version: (row.min_version_value as string) || null,
          max_version: (row.max_version_value as string) || null,
          channel: (row.channel as string) || null,
          platform_key: (row.platform_key as string) || null,
          status: null,
          source: (row.provenance as string) || null,
          confidence: (row.confidence as string) || null,
          notes: (row.notes as string) || null,
          origin: 'legacy',
        });
      }
    }

    for (const row of rows) {
      const list = map.get(row.resource_version_id) || [];
      list.push(row);
      map.set(row.resource_version_id, list);
    }
    return map;
  }

  private normalizeKind(value: unknown): ResourceDependencyKind {
    const kind = String(value || 'required') as ResourceDependencyKind;
    return DEPENDENCY_KINDS.has(kind) ? kind : 'required';
  }

  private intOrNull(value: unknown): number | null {
    const num = Number(value);
    return Number.isInteger(num) && num > 0 ? num : null;
  }
}
