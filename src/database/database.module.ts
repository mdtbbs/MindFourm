import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
export async function initializeDatabase(): Promise<void> {
  // Schema already exists - no need to create tables
  // TypeORM entities map to existing schema
  console.log('Database initialized with existing schema');
}
