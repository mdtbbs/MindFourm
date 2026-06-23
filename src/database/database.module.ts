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

/**
 * Initialize database schema if tables don't exist
 * Called during bootstrap from main.ts
 */
export async function initializeDatabase(dataSource?: DataSource): Promise<void> {
  if (dataSource) {
    try {
      await dataSource.query('ALTER TABLE users ADD COLUMN phone_verified TINYINT(1) NOT NULL DEFAULT 0');
    } catch (err: any) {
      if (err?.code !== 'ER_DUP_FIELDNAME') {
        console.warn('Could not add users.phone_verified:', err?.message || err);
      }
    }

    try {
      await dataSource.query('ALTER TABLE users ADD COLUMN phone_verified_at DATETIME NULL');
    } catch (err: any) {
      if (err?.code !== 'ER_DUP_FIELDNAME') {
        console.warn('Could not add users.phone_verified_at:', err?.message || err);
      }
    }

    try {
      await dataSource.query('ALTER TABLE users ADD COLUMN pending_avatar_url VARCHAR(500) NULL');
    } catch (err: any) {
      if (err?.code !== 'ER_DUP_FIELDNAME') {
        console.warn('Could not add users.pending_avatar_url:', err?.message || err);
      }
    }

    try {
      await dataSource.query("ALTER TABLE users ADD COLUMN avatar_status VARCHAR(30) NOT NULL DEFAULT 'approved'");
    } catch (err: any) {
      if (err?.code !== 'ER_DUP_FIELDNAME') {
        console.warn('Could not add users.avatar_status:', err?.message || err);
      }
    }
  }

  console.log('Database initialized with existing schema');
}
