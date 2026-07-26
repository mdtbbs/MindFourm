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
 */
export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  username: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'mindfourm',
  entities,
  migrations,
  // The CLI must never mutate the schema as a side effect of connecting.
  synchronize: false,
  timezone: '+08:00',
});

export default AppDataSource;
