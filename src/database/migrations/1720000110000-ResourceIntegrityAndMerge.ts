import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';

/** Additive resource integrity, compatibility provenance, idempotency and merge audit schema. */
export class ResourceIntegrityAndMerge1720000110000 implements MigrationInterface {
  name = 'ResourceIntegrityAndMerge1720000110000';
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    const resources = await queryRunner.getTable('resources');
    if (resources) {
      const columns = [
        new TableColumn({ name: 'structure_hash', type: 'char', length: '64', isNullable: true }),
        new TableColumn({ name: 'normalized_structure_hash', type: 'char', length: '64', isNullable: true }),
        new TableColumn({ name: 'duplicate_note', type: 'text', isNullable: true }),
        new TableColumn({ name: 'merged_into_resource_id', type: 'int', isNullable: true }),
      ];
      for (const column of columns) if (!resources.findColumnByName(column.name)) await queryRunner.addColumn('resources', column);
      const refreshed = await queryRunner.getTable('resources');
      for (const [name, columnNames] of [
        ['idx_resources_content_hash_status', ['content_hash', 'status', 'deleted_at']],
        ['idx_resources_structure_hash_status', ['structure_hash', 'status', 'deleted_at']],
        ['idx_resources_normalized_hash_status', ['normalized_structure_hash', 'status', 'deleted_at']],
        ['idx_resources_merged_into', ['merged_into_resource_id']],
        ['idx_resources_kind_title_status', ['resource_kind', 'title', 'status', 'deleted_at']],
        ['idx_resources_kind_source_status', ['resource_kind', 'source_url', 'status', 'deleted_at']],
      ] as Array<[string, string[]]>) {
        if (columnNames.every((columnName) => refreshed?.findColumnByName(columnName)) && !refreshed?.indices.some((index) => index.name === name)) {
          await queryRunner.createIndex('resources', new TableIndex({ name, columnNames }));
        }
      }
    }

    const compatibilities = await queryRunner.getTable('resource_version_compatibilities');
    if (compatibilities && !compatibilities.findColumnByName('provenance')) {
      await queryRunner.addColumn('resource_version_compatibilities', new TableColumn({
        name: 'provenance', type: 'varchar', length: '32', isNullable: false, default: "'user_declared'",
      }));
    }
    const compatTable = await queryRunner.getTable('resource_version_compatibilities');
    if (compatTable && !compatTable.findColumnByName('confidence')) {
      await queryRunner.addColumn('resource_version_compatibilities', new TableColumn({
        name: 'confidence', type: 'varchar', length: '16', isNullable: true,
      }));
    }

    if (!await queryRunner.hasTable('resource_content_hash_claims')) {
      await queryRunner.createTable(new Table({
        name: 'resource_content_hash_claims',
        columns: [
          { name: 'content_hash', type: 'char', length: '64', isPrimary: true },
          { name: 'resource_id', type: 'int' },
          { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
        indices: [new TableIndex({ name: 'idx_resource_hash_claim_resource', columnNames: ['resource_id'] })],
      }), true);
    }
    // Seed outside the table-creation branch so a partially completed migration
    // can safely resume without leaving legacy root hashes unclaimed.
    if (await queryRunner.hasTable('resource_content_hash_claims') && await queryRunner.hasTable('resources')) {
      await queryRunner.query(`INSERT IGNORE INTO resource_content_hash_claims (content_hash, resource_id)
        SELECT content_hash, MIN(id) FROM resources
        WHERE content_hash IS NOT NULL AND content_hash <> '' AND deleted_at IS NULL
          AND merged_into_resource_id IS NULL AND status IN ('pending','pending_review','approved','published')
        GROUP BY content_hash`);
    }
    if (await queryRunner.hasTable('resource_versions')) {
      const versions = await queryRunner.getTable('resource_versions');
      if (['content_hash', 'status', 'resource_id'].every((name) => versions?.findColumnByName(name))
        && !versions?.indices.some((index) => index.name === 'idx_resource_versions_hash_status')) {
        await queryRunner.createIndex('resource_versions', new TableIndex({
          name: 'idx_resource_versions_hash_status', columnNames: ['content_hash', 'status', 'resource_id'],
        }));
      }
      await queryRunner.query(`INSERT IGNORE INTO resource_content_hash_claims (content_hash, resource_id)
        SELECT rv.content_hash, MIN(rv.resource_id) FROM resource_versions rv
        INNER JOIN resources r ON r.id = rv.resource_id
        WHERE rv.content_hash IS NOT NULL AND rv.content_hash REGEXP '^[A-Fa-f0-9]{64}$'
          AND r.deleted_at IS NULL AND r.merged_into_resource_id IS NULL
          AND r.status IN ('pending','pending_review','approved','published')
          AND (rv.status IS NULL OR rv.status IN ('pending','pending_review','published'))
        GROUP BY rv.content_hash`);
    }
    if (await queryRunner.hasTable('resource_files')) {
      const files = await queryRunner.getTable('resource_files');
      if (['content_hash', 'availability_status', 'resource_version_id'].every((name) => files?.findColumnByName(name))
        && !files?.indices.some((index) => index.name === 'idx_resource_files_hash_availability')) {
        await queryRunner.createIndex('resource_files', new TableIndex({
          name: 'idx_resource_files_hash_availability', columnNames: ['content_hash', 'availability_status', 'resource_version_id'],
        }));
      }
      await queryRunner.query(`INSERT IGNORE INTO resource_content_hash_claims (content_hash, resource_id)
        SELECT rf.content_hash, MIN(rv.resource_id) FROM resource_files rf
        INNER JOIN resource_versions rv ON rv.id = rf.resource_version_id
        INNER JOIN resources r ON r.id = rv.resource_id
        WHERE rf.content_hash IS NOT NULL AND rf.content_hash REGEXP '^[A-Fa-f0-9]{64}$'
          AND rf.availability_status = 'available'
          AND r.deleted_at IS NULL AND r.merged_into_resource_id IS NULL
          AND r.status IN ('pending','pending_review','approved','published')
          AND (rv.status IS NULL OR rv.status IN ('pending','pending_review','published'))
        GROUP BY rf.content_hash`);
    }
    if (await queryRunner.hasTable('resource_upload_drafts')) {
      const drafts = await queryRunner.getTable('resource_upload_drafts');
      if (['content_hash', 'expires_at'].every((name) => drafts?.findColumnByName(name))
        && !drafts?.indices.some((index) => index.name === 'idx_resource_upload_drafts_hash_expiry')) {
        await queryRunner.createIndex('resource_upload_drafts', new TableIndex({
          name: 'idx_resource_upload_drafts_hash_expiry', columnNames: ['content_hash', 'expires_at'],
        }));
      }
    }

    if (!await queryRunner.hasTable('resource_structure_hash_claims')) {
      await queryRunner.createTable(new Table({
        name: 'resource_structure_hash_claims',
        columns: [
          { name: 'structure_hash', type: 'char', length: '64', isPrimary: true },
          { name: 'resource_id', type: 'int' },
          { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
        indices: [new TableIndex({ name: 'idx_resource_structure_claim_resource', columnNames: ['resource_id'] })],
      }), true);
      if (await queryRunner.hasTable('resources')) {
        await queryRunner.query(`INSERT IGNORE INTO resource_structure_hash_claims (structure_hash, resource_id)
          SELECT structure_hash, MIN(id) FROM resources
          WHERE structure_hash IS NOT NULL AND structure_hash <> '' AND deleted_at IS NULL
            AND merged_into_resource_id IS NULL AND status IN ('pending','pending_review','approved','published')
          GROUP BY structure_hash`);
      }
    }

    if (!await queryRunner.hasTable('resource_submission_idempotency')) {
      await queryRunner.createTable(new Table({
        name: 'resource_submission_idempotency',
        columns: [
          { name: 'id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment', unsigned: true },
          { name: 'user_id', type: 'int' },
          { name: 'idempotency_key', type: 'varchar', length: '128' },
          { name: 'request_fingerprint', type: 'char', length: '64' },
          { name: 'payload_fingerprint', type: 'char', length: '64' },
          { name: 'resource_id', type: 'int', isNullable: true },
          { name: 'expires_at', type: 'datetime' },
          { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
        uniques: [{ name: 'uq_resource_submission_user_key', columnNames: ['user_id', 'idempotency_key'] }],
        indices: [new TableIndex({ name: 'idx_resource_submission_expiry', columnNames: ['expires_at'] })],
      }), true);
    }

    if (!await queryRunner.hasTable('resource_merge_logs')) {
      await queryRunner.createTable(new Table({
        name: 'resource_merge_logs',
        columns: [
          { name: 'id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment', unsigned: true },
          { name: 'source_resource_id', type: 'int' },
          { name: 'target_resource_id', type: 'int' },
          { name: 'admin_user_id', type: 'int' },
          { name: 'migrated_counts', type: 'json' },
          { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
        indices: [
          new TableIndex({ name: 'idx_resource_merge_source', columnNames: ['source_resource_id'] }),
          new TableIndex({ name: 'idx_resource_merge_target', columnNames: ['target_resource_id'] }),
        ],
      }), true);
    }

    if (await queryRunner.hasTable('resources') && await queryRunner.hasTable('resource_categories')) {
      const ambiguous = await queryRunner.query(`SELECT COUNT(*) AS count FROM resources r
        LEFT JOIN resource_categories c ON c.id = r.category_id
        WHERE (r.resource_kind IS NULL OR r.resource_kind = '' OR r.resource_kind NOT IN
          ('mod','map','schematic','save','game_version','server_plugin','development_tool','texture_ui','other'))
          AND (c.id IS NULL OR LOWER(CONCAT(COALESCE(c.slug,''),' ',COALESCE(c.name,''))) NOT REGEXP 'mod|模组|blueprint|schematic|蓝图|map|地图|save|存档|game.?version|游戏版本|server.?plugin|服务器插件|plugin|插件|texture|材质|界面|tool|工具')`);
      console.info(`[ResourceIntegrityAndMerge] unmapped legacy resource kinds: ${Number(ambiguous?.[0]?.count || 0)}`);
      await queryRunner.query(`UPDATE resources r LEFT JOIN resource_categories c ON c.id = r.category_id
        SET r.resource_kind = CASE
          WHEN LOWER(CONCAT(COALESCE(c.slug,''),' ',COALESCE(c.name,''))) REGEXP 'blueprint|schematic|蓝图' THEN 'schematic'
          WHEN LOWER(CONCAT(COALESCE(c.slug,''),' ',COALESCE(c.name,''))) REGEXP 'map|地图' THEN 'map'
          WHEN LOWER(CONCAT(COALESCE(c.slug,''),' ',COALESCE(c.name,''))) REGEXP 'save|存档' THEN 'save'
          WHEN LOWER(CONCAT(COALESCE(c.slug,''),' ',COALESCE(c.name,''))) REGEXP 'game.?version|游戏版本' THEN 'game_version'
          WHEN LOWER(CONCAT(COALESCE(c.slug,''),' ',COALESCE(c.name,''))) REGEXP 'server.?plugin|服务器插件' THEN 'server_plugin'
          WHEN LOWER(CONCAT(COALESCE(c.slug,''),' ',COALESCE(c.name,''))) REGEXP 'mod|模组' THEN 'mod'
          WHEN LOWER(CONCAT(COALESCE(c.slug,''),' ',COALESCE(c.name,''))) REGEXP 'plugin|插件' THEN 'server_plugin'
          WHEN LOWER(CONCAT(COALESCE(c.slug,''),' ',COALESCE(c.name,''))) REGEXP 'texture|材质|界面' THEN 'texture_ui'
          WHEN LOWER(CONCAT(COALESCE(c.slug,''),' ',COALESCE(c.name,''))) REGEXP 'tool|工具' THEN 'development_tool'
          ELSE 'other' END
        WHERE r.resource_kind IS NULL OR r.resource_kind = '' OR r.resource_kind NOT IN
          ('mod','map','schematic','save','game_version','server_plugin','development_tool','texture_ui','other')`);
    } else if (await queryRunner.hasTable('resources')) {
      const ambiguous = await queryRunner.query(`SELECT COUNT(*) AS count FROM resources
        WHERE resource_kind IS NULL OR resource_kind = '' OR resource_kind NOT IN
          ('mod','map','schematic','save','game_version','server_plugin','development_tool','texture_ui','other')`);
      console.info(`[ResourceIntegrityAndMerge] unmapped legacy resource kinds: ${Number(ambiguous?.[0]?.count || 0)}`);
      await queryRunner.query(`UPDATE resources SET resource_kind = 'other'
        WHERE resource_kind IS NULL OR resource_kind = '' OR resource_kind NOT IN
          ('mod','map','schematic','save','game_version','server_plugin','development_tool','texture_ui','other')`);
    }
  }

  async down(): Promise<void> {
    // Durable deduplication and merge audit records are retained on rollback.
  }
}
