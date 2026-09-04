import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LanLinkQuickCode } from '@entities/lanlink-quick-code.entity';
import { User } from '@entities/user.entity';
import { ExternalApiKeyGuard } from '@common/guards/external-api-key.guard';
import { AuthModule } from '../auth/auth.module';
import { ServiceApiModule } from '../service-api/service-api.module';
import {
  ExternalLanLinkQuickCodeController,
  LanLinkQuickCodeController,
} from './lanlink-quick-code.controller';
import { LanLinkQuickCodeService } from './lanlink-quick-code.service';
import { LanLinkRoomsService } from './lanlink-rooms.service';
import { LanLinkRoomsV1Controller } from './lanlink-rooms-v1.controller';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([LanLinkQuickCode, User]),
    AuthModule,
    ServiceApiModule,
  ],
  controllers: [LanLinkQuickCodeController, ExternalLanLinkQuickCodeController, LanLinkRoomsV1Controller],
  providers: [LanLinkQuickCodeService, LanLinkRoomsService, ExternalApiKeyGuard],
  exports: [LanLinkQuickCodeService],
})
export class LanLinkModule {}
