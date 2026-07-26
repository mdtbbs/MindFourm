import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { entities } from '../entities';
import { migrations } from './migrations';
import { RedisModule } from './redis.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('mysql.host'),
        port: config.get<number>('mysql.port'),
        username: config.get<string>('mysql.user'),
        password: config.get<string>('mysql.password'),
        database: config.get<string>('mysql.database'),
        entities,
        // Explicit class array, not a glob: the list has to resolve identically
        // under ts-node and from the compiled `dist/` output.
        migrations,
        migrationsRun: true,
        // MySQL commits DDL implicitly, so an 'all'-mode wrapper transaction could
        // not roll a failed batch back regardless; per-migration scope at least
        // keeps each data migration's UPDATEs atomic. Individual migrations opt out
        // via their `transaction` property.
        migrationsTransactionMode: 'each',
        // Never true, in any environment. `app.env` falls back to 'development'
        // when NODE_ENV is unset, so keying this off the environment handed
        // schema auto-mutation to every deployment that forgot to set it — and
        // synchronize silently drops columns it cannot reconcile. Migrations are
        // the only thing permitted to change the schema.
        synchronize: false,
        logging: config.get<string>('app.env') === 'development',
        timezone: '+08:00',
      }),
    }),
    RedisModule,
  ],
  exports: [TypeOrmModule, RedisModule],
})
export class DatabaseModule {}

async function tableExists(dataSource: DataSource, tableName: string): Promise<boolean> {
  const rows = await dataSource.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = ?
      LIMIT 1`,
    [tableName],
  );
  return rows.length > 0;
}

async function assertRequiredTables(dataSource: DataSource): Promise<void> {
  const requiredTables = [
    'users',
    'posts',
    'settings',
    'point_rules',
    'levels',
    'badges',
    'email_logs',
    'search_history',
    'popular_searches',
    'admin_notifications',
    'resource_categories',
    'resources',
    'resource_versions',
  ];
  const missing: string[] = [];
  for (const table of requiredTables) {
    if (!(await tableExists(dataSource, table))) {
      missing.push(table);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Database schema is incomplete. Missing tables: ${missing.join(', ')}. ` +
      'Run `npm run migration:run` against this database.',
    );
  }
}

/**
 * Verify the schema migrations were supposed to produce.
 *
 * DDL now belongs entirely to `src/database/migrations`, which TypeORM runs during
 * `DataSource.initialize()` — before this is called. This is a fail-fast check that
 * they actually ran, so a misconfigured database surfaces at boot rather than as a
 * 500 on the first request that touches a missing table.
 */
export async function initializeDatabase(dataSource?: DataSource): Promise<void> {
  if (dataSource) {
    await assertRequiredTables(dataSource);
  }

  console.log('Database schema is ready');
}
