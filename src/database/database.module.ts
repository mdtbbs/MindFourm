import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { entities } from '../entities';
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
        synchronize: config.get<string>('app.env') === 'development', // Auto-sync in dev
        logging: config.get<string>('app.env') === 'development',
        timezone: '+08:00',
      }),
    }),
    RedisModule,
  ],
  exports: [TypeOrmModule, RedisModule],
})
export class DatabaseModule {}

async function hasAnyApplicationTables(dataSource: DataSource): Promise<boolean> {
  const rows = await dataSource.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_type = 'BASE TABLE'
      LIMIT 1`,
  );
  return rows.length > 0;
}

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

async function columnExists(
  dataSource: DataSource,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const rows = await dataSource.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?
      LIMIT 1`,
    [tableName, columnName],
  );
  return rows.length > 0;
}

async function addColumnIfMissing(
  dataSource: DataSource,
  tableName: string,
  columnName: string,
  definition: string,
): Promise<void> {
  if (!(await tableExists(dataSource, tableName))) return;
  if (await columnExists(dataSource, tableName, columnName)) return;
  await dataSource.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
}

async function ensureResourceTables(dataSource: DataSource): Promise<void> {
  if (!(await tableExists(dataSource, 'users'))) return;

  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS resource_categories (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL UNIQUE,
      description TEXT,
      icon VARCHAR(50),
      sort_order INT DEFAULT 0,
      is_active TINYINT DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_resource_categories_slug (slug),
      INDEX idx_resource_categories_active (is_active)
    )
  `);

  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS resources (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      resource_type VARCHAR(50) NOT NULL DEFAULT 'upload',
      file_name VARCHAR(255),
      file_path VARCHAR(500),
      file_size INT NULL,
      mime_type VARCHAR(100),
      external_url VARCHAR(500),
      version VARCHAR(50),
      content TEXT,
      content_html TEXT,
      category_id INT NULL,
      download_count INT DEFAULT 0,
      is_public TINYINT DEFAULT 0,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES resource_categories(id) ON DELETE SET NULL,
      INDEX idx_resources_user (user_id),
      INDEX idx_resources_status (status),
      INDEX idx_resources_public (is_public, status),
      INDEX idx_resources_created (created_at DESC),
      INDEX idx_resources_category (category_id),
      INDEX idx_resources_type (resource_type)
    )
  `);

  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS resource_versions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      resource_id INT NOT NULL,
      version VARCHAR(50) NOT NULL,
      file_path VARCHAR(500),
      file_name VARCHAR(255),
      file_size INT,
      mime_type VARCHAR(100),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
      UNIQUE KEY unique_version (resource_id, version),
      INDEX idx_resource_versions_resource (resource_id)
    )
  `);
}

async function ensureAdminNotificationTables(dataSource: DataSource): Promise<void> {
  if (!(await tableExists(dataSource, 'users'))) return;

  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS admin_notifications (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      event_key VARCHAR(100) NOT NULL,
      category VARCHAR(50) NOT NULL,
      level VARCHAR(30) NOT NULL DEFAULT 'info',
      title VARCHAR(255) NOT NULL,
      content TEXT NULL,
      action_url VARCHAR(500) NULL,
      metadata_json TEXT NULL,
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      read_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_admin_notifications_user_read (user_id, is_read),
      INDEX idx_admin_notifications_user_created (user_id, created_at DESC),
      INDEX idx_admin_notifications_event_key (event_key)
    )
  `);
}

async function ensureExistingSchemaPatches(dataSource: DataSource): Promise<void> {
  await ensureResourceTables(dataSource);
  await ensureAdminNotificationTables(dataSource);

  await addColumnIfMissing(dataSource, 'users', 'total_points', 'INT NOT NULL DEFAULT 0');
  await addColumnIfMissing(dataSource, 'users', 'available_points', 'INT NOT NULL DEFAULT 0');
  await addColumnIfMissing(dataSource, 'users', 'reply_email', 'TINYINT(1) NOT NULL DEFAULT 1');
  await addColumnIfMissing(dataSource, 'users', 'mention_email', 'TINYINT(1) NOT NULL DEFAULT 1');
  await addColumnIfMissing(dataSource, 'users', 'message_email', 'TINYINT(1) NOT NULL DEFAULT 1');
  await addColumnIfMissing(dataSource, 'users', 'system_email', 'TINYINT(1) NOT NULL DEFAULT 1');
  await addColumnIfMissing(dataSource, 'users', 'digest_email', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfMissing(dataSource, 'users', 'phone_verified', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfMissing(dataSource, 'users', 'phone_verified_at', 'DATETIME NULL');
  await addColumnIfMissing(dataSource, 'users', 'pending_avatar_url', 'VARCHAR(500) NULL');
  await addColumnIfMissing(dataSource, 'users', 'avatar_status', "VARCHAR(30) NOT NULL DEFAULT 'approved'");
  await addColumnIfMissing(dataSource, 'users', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

  await addColumnIfMissing(dataSource, 'posts', 'server_id', 'INT NULL');
  await addColumnIfMissing(dataSource, 'posts', 'required_group_id', 'INT NULL');
  await addColumnIfMissing(dataSource, 'posts', 'post_type', "VARCHAR(50) NOT NULL DEFAULT 'normal'");
  await addColumnIfMissing(dataSource, 'posts', 'like_count', 'INT NOT NULL DEFAULT 0');

  await addColumnIfMissing(dataSource, 'replies', 'like_count', 'INT NOT NULL DEFAULT 0');

  await addColumnIfMissing(dataSource, 'resource_versions', 'file_name', 'VARCHAR(255) NULL');
  await addColumnIfMissing(dataSource, 'resource_versions', 'file_size', 'INT NULL');
  await addColumnIfMissing(dataSource, 'resource_versions', 'mime_type', 'VARCHAR(100) NULL');

  await addColumnIfMissing(dataSource, 'resources', 'use_mfl', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfMissing(dataSource, 'resources', 'mfl_file_id', 'INT NULL');
  await addColumnIfMissing(dataSource, 'resources', 'mfl_download_url', 'VARCHAR(500) NULL');

  await addColumnIfMissing(dataSource, 'posts', 'reject_reason', 'VARCHAR(500) NULL');

  // Soft-delete columns
  await addColumnIfMissing(dataSource, 'posts', 'deleted_at', 'DATETIME NULL');
  await addColumnIfMissing(dataSource, 'replies', 'deleted_at', 'DATETIME NULL');
  await addColumnIfMissing(dataSource, 'resources', 'deleted_at', 'DATETIME NULL');

  // Rendered HTML content
  await addColumnIfMissing(dataSource, 'posts', 'content_html', 'TEXT NULL');
  await addColumnIfMissing(dataSource, 'replies', 'content_html', 'TEXT NULL');

  // Messages table patches
  await addColumnIfMissing(dataSource, 'messages', 'content_html', 'TEXT NULL');
  await addColumnIfMissing(dataSource, 'messages', 'group_chat_id', 'INT NULL');
  await addColumnIfMissing(dataSource, 'messages', 'deleted_by_sender', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfMissing(dataSource, 'messages', 'deleted_by_recipient', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfMissing(dataSource, 'messages', 'read_at', 'DATETIME NULL');
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
      'Run migrations or start with an empty database so the application can create the initial schema.',
    );
  }
}

/**
 * Initialize database schema if tables don't exist
 * Called during bootstrap from main.ts
 */
export async function initializeDatabase(dataSource?: DataSource): Promise<void> {
  if (dataSource) {
    if (!(await hasAnyApplicationTables(dataSource))) {
      await dataSource.synchronize(false);
    } else {
      await ensureExistingSchemaPatches(dataSource);
      await assertRequiredTables(dataSource);
    }
  }

  console.log('Database schema is ready');
}
