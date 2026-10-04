import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityAccessLog } from '@entities/security-access-log.entity';
import { LogsModule } from '../logs/logs.module';
import { SecurityAccessLogsController } from './security-access-logs.controller';
import { SecurityAccessLogsMiddleware } from './security-access-logs.middleware';
import { SecurityAccessLogsService } from './security-access-logs.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [TypeOrmModule.forFeature([SecurityAccessLog]), LogsModule, SettingsModule],
  controllers: [SecurityAccessLogsController],
  providers: [SecurityAccessLogsService, SecurityAccessLogsMiddleware],
  exports: [SecurityAccessLogsService],
})
export class SecurityAccessLogsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SecurityAccessLogsMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
