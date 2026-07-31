import 'dotenv/config';
import { DataSource } from 'typeorm';
import { entities } from '../entities';
import { migrations } from './migrations';

/**
 * DataSource for the TypeORM CLI (`npm run migration:*`).
 *
 * The running application configures its own DataSource through
 * `DatabaseModule`/ConfigService; this exists only so the CLI can reach the same
 * database with the same entity and migration set. Both must stay in sync — a CLI
 * pointed at a different `migrations` array would record migrations the app does
 * not know about.
 *
 * Exported exactly once, as the default. A named export alongside the default counts
 * as two DataSource exports to the CLI, which then refuses to run at all with "Given
 * data source file must contain only one export of DataSource instance" — so every
 * `npm run migration:*` command failed, including the one the application's own
 * fatal "schema is incomplete" message tells the operator to run.
 */
const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  username: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'mindfourm',
  entities,
  migrations,
  // Must match `DatabaseModule`. Several migrations set their own transaction mode,
  // and under the default "all" the CLI rejects the whole run with
  // ForbiddenTransactionModeOverrideError rather than executing anything.
  migrationsTransactionMode: 'each',
  // The CLI must never mutate the schema as a side effect of connecting.
  synchronize: false,
});

export default AppDataSource;
