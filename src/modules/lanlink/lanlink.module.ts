import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LanLinkQuickCode } from '@entities/lanlink-quick-code.entity';
import { ExternalApiKeyGuard } from '@common/guards/external-api-key.guard';
import { AuthModule } from '../auth/auth.module';
import { ServiceApiModule } from '../service-api/service-api.module';
import {
  ExternalLanLinkQuickCodeController,
  LanLinkQuickCodeController,
} from './lanlink-quick-code.controller';
import { LanLinkQuickCodeService } from './lanlink-quick-code.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([LanLinkQuickCode]),
    AuthModule,
    ServiceApiModule,
  ],
  controllers: [LanLinkQuickCodeController, ExternalLanLinkQuickCodeController],
  providers: [LanLinkQuickCodeService, ExternalApiKeyGuard],
  exports: [LanLinkQuickCodeService],
})
export class LanLinkModule {}
