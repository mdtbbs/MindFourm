#!/usr/bin/env node

// The historical migration chain starts from a deployed legacy schema. Its
// empty-database baseline synchronizes current entities, which already contain
// columns and tables later historical migrations add. Prepare the isolated E2E
// database at the current deployed schema, then leave only this release's two
// migrations pending so the smoke suite exercises their real MySQL DDL.

const EXPECTED_DATABASE = 'mindfourm_ci';
const FIRST_RELEASE_MIGRATION = 1720000240000;

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

    // Materialize the currently deployed entity schema in the disposable E2E DB.
    await dataSource.synchronize(false);

    // Revert only the schema changes introduced by this release so its actual
    // migrations, rather than entity synchronization, create them below.
    await dataSource.query('DROP TABLE IF EXISTS `security_access_logs`');
    await dataSource.query('ALTER TABLE `social_privacy_settings` DROP COLUMN `allow_messages`');

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

    console.log(`Prepared ${deployedMigrations.length} deployed migrations; release migrations remain pending.`);
  } finally {
    await dataSource.destroy();
  }
}

prepare().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
