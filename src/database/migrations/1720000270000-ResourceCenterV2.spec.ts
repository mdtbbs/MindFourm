import { ResourceCenterV21720000270000 } from './1720000270000-ResourceCenterV2';

function makeQueryRunner(options: { duplicateRevisions?: boolean } = {}) {
  const tables = new Set([
    'resources', 'users', 'resource_versions', 'resource_version_dependencies', 'resource_version_compatibilities',
    'resource_relations',
  ]);
  const columns = new Set([
    'resource_versions.resource_id', 'resource_versions.version',
    'resource_versions.status', 'resource_versions.published_at', 'resource_versions.release_channel',
    'resources.user_id',
    'resource_relations.source_resource_id', 'resource_relations.target_resource_id', 'resource_relations.relation_type',
    'resource_version_compatibilities.provenance', 'resource_version_compatibilities.confidence',
  ]);
  const indices = new Set(['resource_versions:unique_version']);
  const statements: string[] = [];
  const query = jest.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('information_schema.tables')) return tables.has(String(params[0])) ? [{ exists: 1 }] : [];
    if (sql.includes('information_schema.columns')) return columns.has(`${params[0]}.${params[1]}`) ? [{ exists: 1 }] : [];
    if (sql.includes('information_schema.statistics')) {
      if (sql.includes('GROUP_CONCAT(column_name ORDER BY seq_in_index)')) {
        const table = String(params[0] || '');
        const columns = String(params[1] || '');
        if (table === 'resource_relations' && columns === 'source_resource_id,target_resource_id,relation_type'
          && indices.has('resource_relations:uq_resource_relations_pair')) return [{ index_name: 'uq_resource_relations_pair' }];
        if (table === 'resource_relations' && columns === 'source_resource_id,target_resource_id,relation_type,relation_context'
          && indices.has('resource_relations:uq_resource_relations_pair_context')) return [{ index_name: 'uq_resource_relations_pair_context' }];
        return [];
      }
      return indices.has(`${params[0]}:${params[1]}`) ? [{ exists: 1 }] : [];
    }
    if (/GROUP BY resource_id\s*,\s*version HAVING COUNT\(\*\) > 1 LIMIT 1/.test(sql)) {
      return options.duplicateRevisions ? [{ resource_id: 1, version: '1.0' }] : [];
    }
    if (sql.includes('GROUP BY resource_id, version HAVING COUNT(*) > 1')) return [];
    statements.push(sql);
    const createTable = sql.match(/CREATE TABLE IF NOT EXISTS `?([a-z_]+)`?/i);
    if (createTable) tables.add(createTable[1]);
    const addColumn = sql.match(/ALTER TABLE `([^`]+)` ADD COLUMN `([^`]+)`/i);
    if (addColumn) columns.add(`${addColumn[1]}.${addColumn[2]}`);
    const addUnique = sql.match(/ALTER TABLE `([^`]+)` ADD CONSTRAINT `([^`]+)` UNIQUE/i);
    if (addUnique) indices.add(`${addUnique[1]}:${addUnique[2]}`);
    const dropIndex = sql.match(/DROP INDEX `([^`]+)` ON `([^`]+)`/i);
    if (dropIndex) indices.delete(`${dropIndex[2]}:${dropIndex[1]}`);
    const createIndex = sql.match(/CREATE INDEX `([^`]+)` ON `([^`]+)`/i);
    if (createIndex) indices.add(`${createIndex[2]}:${createIndex[1]}`);
    return [];
  });
  indices.add('resource_relations:uq_resource_relations_pair');
  const queryRunner = {
    query,
    getTable: jest.fn(async () => ({ indices: [{ name: 'unique_version', columnNames: ['resource_id', 'version'], isUnique: true, isPrimary: false }] })),
    dropIndex: jest.fn(async (_table: string, index: { name: string }) => { indices.delete(`resource_versions:${index.name}`); }),
    dropColumn: jest.fn(async (table: string, column: string) => { columns.delete(`${table}.${column}`); }),
  };
  return { queryRunner, statements, tables, columns, indices };
}

describe('ResourceCenterV2 migration', () => {
  it('creates additive schema, revisions unique key, owner memberships, and legacy copies', async () => {
    const { queryRunner, statements, columns, indices } = makeQueryRunner();
    const migration = new ResourceCenterV21720000270000();

    await migration.up(queryRunner as any);

    expect(migration.transaction).toBe(false);
    for (const column of [
      'version_mode', 'revision', 'recommended', 'game_version_min', 'game_version_max',
    ]) expect(columns.has(`resource_versions.${column}`)).toBe(true);
    expect(indices.has('resource_versions:uq_resource_versions_resource_version_revision')).toBe(true);
    expect(indices.has('resource_versions:idx_resource_versions_recommended')).toBe(true);
    expect(indices.has('resource_versions:idx_resource_versions_channel')).toBe(true);
    expect(columns.has('resource_relations.relation_context')).toBe(true);
    expect(indices.has('resource_relations:uq_resource_relations_pair_context')).toBe(true);
    expect(indices.has('resource_relations:uq_resource_relations_pair')).toBe(false);
    expect(queryRunner.dropIndex).toHaveBeenCalledWith('resource_versions', expect.objectContaining({ name: 'unique_version' }));
    expect(statements.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS resource_members'))).toBe(true);
    expect(statements.some((sql) => sql.includes("SELECT id,user_id,'owner','active',NOW(6) FROM resources"))).toBe(true);
    expect(statements.some((sql) => sql.includes('INSERT IGNORE INTO resource_dependencies'))).toBe(true);
    expect(statements.some((sql) => sql.includes('INSERT IGNORE INTO resource_compatibilities'))).toBe(true);
    expect(statements.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS map_version_metadata'))).toBe(true);
    expect(statements.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS schematic_version_metadata'))).toBe(true);
    expect(statements.some((sql) => sql.includes('uq_mod_issue_reports_version_user'))).toBe(true);
    expect(columns.has('map_version_metadata.preview_key')).toBe(true);
    expect(columns.has('schematic_version_metadata.preview_key')).toBe(true);
  });

  it('refuses rollback when revision rows cannot fit the legacy unique key', async () => {
    const { queryRunner, statements } = makeQueryRunner({ duplicateRevisions: true });

    await expect(new ResourceCenterV21720000270000().down(queryRunner as any))
      .rejects.toThrow('Cannot revert Resource Center V2 while multiple revisions of a version exist');
    expect(statements).toHaveLength(0);
  });
});
