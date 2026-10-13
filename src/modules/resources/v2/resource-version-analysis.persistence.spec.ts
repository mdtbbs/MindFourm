import { ResourceDependency } from '@entities/resource-center-v2.entity';
import { persistRendererAnalysis } from './resource-version-analysis.persistence';

/**
 * Records what the persistence boundary would store without a database: the
 * real analyzers run, and only the EntityManager is faked.
 */
function createManager(aliasRows: Array<{ mod_id: string; resource_id: number; canonical: number }> = []) {
  const saved: Array<{ entity: unknown; rows: any[] }> = [];
  const manager = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      // The resolver asks for both spellings in one UNION; echo back only the
      // identifiers it actually queried so the fake cannot invent resolutions.
      if (!/mod_profiles|mod_id_aliases/.test(sql)) return [];
      const asked = new Set(params.slice(0, params.length / 2).map(value => String(value).toLowerCase()));
      return aliasRows.filter(row => asked.has(row.mod_id.toLowerCase()));
    }),
    create: jest.fn((_entity: unknown, values: Record<string, unknown>) => ({ ...values })),
    save: jest.fn(async (entity: unknown, rows: any) => {
      saved.push({ entity, rows: Array.isArray(rows) ? rows : [rows] });
      return rows;
    }),
    delete: jest.fn(async (entity: unknown, criteria: { resource_version_id?: number }) => {
      if (entity === ResourceDependency && criteria.resource_version_id !== undefined) {
        for (const item of saved) {
          if (item.entity === ResourceDependency) {
            item.rows = item.rows.filter(row => row.resource_version_id !== criteria.resource_version_id);
          }
        }
      }
      return { affected: 0 };
    }),
  };
  const dependencies = () => saved.filter(item => item.entity === ResourceDependency).flatMap(item => item.rows);
  return { manager, saved, dependencies };
}

const base = { resourceId: 7, actorId: 9 };

describe('structured renderer analysis persistence', () => {
  it('keeps schematic version dependencies as the union of renderer and author declarations (AC 1, 2)', async () => {
    const merged = createManager();
    await persistRendererAnalysis(merged.manager as any, {
      ...base, versionId: 101, kind: 'schematic',
      rendererMetadata: { width: 4, height: 4, mod_dependencies: ['alpha-mod', 'beta-mod'] },
      publisherMetadata: { required_mods: ['beta-mod', 'gamma-mod'] },
    });
    expect(merged.dependencies().map(row => row.external_identifier)).toEqual(['alpha-mod', 'beta-mod', 'gamma-mod']);

    // An empty renderer list must not retract the author's declaration, and vice versa.
    const authorOnly = createManager();
    await persistRendererAnalysis(authorOnly.manager as any, {
      ...base, versionId: 102, kind: 'schematic',
      rendererMetadata: { width: 4, height: 4, mod_dependencies: [] },
      publisherMetadata: { required_mods: ['author-mod'] },
    });
    expect(authorOnly.dependencies().map(row => row.external_identifier)).toEqual(['author-mod']);

    const rendererOnly = createManager();
    await persistRendererAnalysis(rendererOnly.manager as any, {
      ...base, versionId: 103, kind: 'schematic',
      rendererMetadata: { mod_dependencies: ['renderer-mod'] },
      publisherMetadata: { required_mods: [] },
    });
    expect(rendererOnly.dependencies().map(row => row.external_identifier)).toEqual(['renderer-mod']);
  });

  it('does the same for map versions and keeps each declaration on its own version (AC 5)', async () => {
    const manager = createManager();
    await persistRendererAnalysis(manager.manager as any, {
      ...base, versionId: 201, kind: 'map',
      rendererMetadata: { width: 30, height: 30, mod_dependencies: ['alpha-mod'] },
      publisherMetadata: { required_mods: ['beta-mod'] },
    });
    await persistRendererAnalysis(manager.manager as any, {
      ...base, versionId: 202, kind: 'map',
      rendererMetadata: { width: 30, height: 30, mod_dependencies: [] },
      publisherMetadata: { required_mods: ['gamma-mod'] },
    });
    expect(manager.dependencies().filter(row => row.resource_version_id === 201).map(row => row.external_identifier))
      .toEqual(['alpha-mod', 'beta-mod']);
    expect(manager.dependencies().filter(row => row.resource_version_id === 202).map(row => row.external_identifier))
      .toEqual(['gamma-mod']);
  });

  it('replaces prior dependencies on re-analysis, including when the new result is empty', async () => {
    const manager = createManager();
    await persistRendererAnalysis(manager.manager as any, {
      ...base, versionId: 251, kind: 'map',
      rendererMetadata: { width: 12, height: 12, mod_dependencies: ['old-mod'] },
      publisherMetadata: {},
    });
    await persistRendererAnalysis(manager.manager as any, {
      ...base, versionId: 251, kind: 'map',
      rendererMetadata: { width: 12, height: 12, mod_dependencies: ['new-mod'] },
      publisherMetadata: {},
    });

    expect(manager.dependencies()).toHaveLength(1);
    expect(manager.dependencies()[0]).toMatchObject({
      resource_version_id: 251, external_identifier: 'new-mod', resolution_status: 'unresolved',
    });

    await persistRendererAnalysis(manager.manager as any, {
      ...base, versionId: 251, kind: 'map',
      rendererMetadata: { width: 12, height: 12, mod_dependencies: [] },
      publisherMetadata: {},
    });

    expect(manager.dependencies()).toEqual([]);
    expect(manager.manager.delete).toHaveBeenCalledWith(ResourceDependency, { resource_version_id: 251 });
  });

  it('collapses an alias and its canonical Mod into one resolved record (AC 3)', async () => {
    // `alpha-mod` is the profile name; `alpha-alias` is a second spelling of the same resource.
    const manager = createManager([
      { mod_id: 'alpha-mod', resource_id: 55, canonical: 1 },
      { mod_id: 'alpha-alias', resource_id: 55, canonical: 0 },
    ]);
    await persistRendererAnalysis(manager.manager as any, {
      ...base, versionId: 301, kind: 'map',
      rendererMetadata: { width: 8, height: 8, mod_dependencies: ['alpha-alias', 'alpha-mod'] },
      publisherMetadata: { required_mods: ['alpha-mod'] },
    });
    const rows = manager.dependencies();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      target_resource_id: 55, resolution_status: 'resolved', external_identifier: 'alpha-mod', dependency_type: 'required',
    });
    const query = manager.manager.query.mock.calls.find(([sql]) => String(sql).includes('FROM mod_profiles'))?.[0] as string;
    expect(query).toMatch(/SELECT LOWER\(mod_id\) AS mod_id, resource_id, 1 AS canonical FROM mod_profiles/);
    expect(query).toMatch(/SELECT LOWER\(alias\) AS mod_id, resource_id, 0 AS canonical FROM mod_id_aliases/);
  });

  it('retains unresolved declarations without inventing a Mod ID (AC 4, 6)', async () => {
    const manager = createManager([{ mod_id: 'known-mod', resource_id: 55, canonical: 1 }]);
    await persistRendererAnalysis(manager.manager as any, {
      ...base, versionId: 401, kind: 'schematic',
      rendererMetadata: {
        mod_dependencies: ['known-mod'],
        compatibility: { unknown_content: ['unknown-block'] },
      },
      publisherMetadata: { required_mods: ['ghost-mod'] },
    });
    const rows = manager.dependencies();
    expect(rows.map(row => row.external_identifier)).toEqual(['known-mod', 'ghost-mod']);
    expect(rows[0]).toMatchObject({ target_resource_id: 55, resolution_status: 'resolved' });
    // Unresolved keeps the author's own token; nothing is resolved to an unrelated resource.
    expect(rows[1]).toMatchObject({
      target_resource_id: null, resolution_status: 'unresolved', external_identifier: 'ghost-mod',
    });
    expect(rows).toHaveLength(2);
  });

  it('stores no dependency record when neither evidence source declares one (AC 6)', async () => {
    const manager = createManager();
    await persistRendererAnalysis(manager.manager as any, {
      ...base, versionId: 501, kind: 'map',
      rendererMetadata: { width: 16, height: 16, compatibility: { unknown_content: ['mystery-block'] } },
      publisherMetadata: {},
    });
    expect(manager.dependencies()).toEqual([]);
  });
});
