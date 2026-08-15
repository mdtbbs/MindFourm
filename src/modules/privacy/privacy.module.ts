import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserDataDeletionRequest } from '../../entities/user-data-deletion-request.entity';
import { LogsModule } from '../logs/logs.module';
import { PrivacyService } from './privacy.service';
import { PrivacyController } from './privacy.controller';
import { AdminPrivacyController } from './admin-privacy.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserDataDeletionRequest]), LogsModule],
  providers: [PrivacyService],
  controllers: [PrivacyController, AdminPrivacyController],
  exports: [PrivacyService],
})
export class PrivacyModule {}
