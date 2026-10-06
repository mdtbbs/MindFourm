#!/usr/bin/env node

// The historical migration chain starts from a deployed legacy schema. Its
// empty-database baseline synchronizes current entities, which already contain
// columns and tables later historical migrations add. Prepare the isolated E2E
// database at the current deployed schema, then leave only this PR's migrations
// pending so the smoke suite exercises their real MySQL DDL.

const EXPECTED_DATABASE = 'mindfourm_ci';
const FIRST_RELEASE_MIGRATION = 1720000290000;

if (
  process.env.NODE_ENV !== 'test'
  || process.env.MYSQL_HOST !== '127.0.0.1'
  || process.env.MYSQL_DATABASE !== EXPECTED_DATABASE
) {
  throw new Error('E2E schema preparation is restricted to the isolated mindfourm_ci database.');
}

const { default: dataSource } = require('../dist/database/data-source');
const { migrations } = require('../dist/database/migrations');

async function prepare() {
  await dataSource.initialize();
  try {
    const [{ db_name: database }] = await dataSource.query('SELECT DATABASE() AS db_name');
    if (database !== EXPECTED_DATABASE) {
      throw new Error(`Refusing to prepare unexpected database: ${database}`);
    }

    // Materialize the current entity schema in the disposable E2E DB.
    await dataSource.synchronize(false);

    // These historical migrations own runtime tables that are not mapped as
    // TypeORM entities. Synchronization cannot create them, but resource
    // uploads and downloads use them in the deployed schema.
    const runtimeSchemaMigrations = migrations
      .map((Migration) => new Migration())
      .filter((migration) => [
        'GameContentDurability1720000060000',
        'ResourceIntegrityAndMerge1720000110000',
      ].includes(migration.name));
    const expectedRuntimeMigrations = new Set([
      'GameContentDurability1720000060000',
      'ResourceIntegrityAndMerge1720000110000',
    ]);
    if (runtimeSchemaMigrations.length !== expectedRuntimeMigrations.size) {
      throw new Error('A required runtime schema migration is missing from the migration registry.');
    }
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      for (const migration of runtimeSchemaMigrations) {
        await migration.up(queryRunner);
      }
    } finally {
      await queryRunner.release();
    }

    // synchronize(false) includes the fields/tables introduced by this PR.
    // Remove exactly those additions so 029/030/031 are exercised by
    // `typeorm migration:run` below. Earlier migrations belong to master and
    // must remain represented in the deployed baseline.
    await dataSource.query('DROP TABLE IF EXISTS `resource_direct_upload_sessions`');
    await dataSource.query('ALTER TABLE `resource_upload_drafts` DROP COLUMN `preview_binding_id`, DROP COLUMN `preview_object_id`');
    await dataSource.query('ALTER TABLE `resource_versions` DROP COLUMN `renderer_preview_binding_id`, DROP COLUMN `renderer_preview_object_id`');
    await dataSource.query('ALTER TABLE `resources` DROP COLUMN `renderer_preview_binding_id`, DROP COLUMN `renderer_preview_object_id`');
    await dataSource.query('ALTER TABLE `resource_files` DROP COLUMN `provider_binding_id`, DROP COLUMN `provider_object_id`');

    await dataSource.query(
      'CREATE TABLE IF NOT EXISTS migrations (id int NOT NULL AUTO_INCREMENT, `timestamp` bigint NOT NULL, `name` varchar(255) NOT NULL, PRIMARY KEY (id)) ENGINE=InnoDB',
    );

    const deployedMigrations = migrations
      .map((Migration) => new Migration())
      .map((migration) => {
        const match = /(\d{13})$/.exec(migration.name);
        if (!match) throw new Error(`Migration has no timestamp suffix: ${migration.name}`);
        return { name: migration.name, timestamp: Number(match[1]) };
      })
      .filter(({ timestamp }) => timestamp < FIRST_RELEASE_MIGRATION)
      .sort((left, right) => left.timestamp - right.timestamp);

    for (const migration of deployedMigrations) {
      await dataSource.query(
        'INSERT INTO `migrations` (`timestamp`, `name`) VALUES (?, ?)',
        [migration.timestamp, migration.name],
      );
    }

    console.log(`Prepared ${deployedMigrations.length} deployed migrations; PR migrations remain pending.`);
  } finally {
    await dataSource.destroy();
  }
}

prepare().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
