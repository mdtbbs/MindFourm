import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsService } from './settings.service';
import { SettingsRevalidationService } from './settings-revalidation.service';
import { SettingsController } from './settings.controller';
import { Setting } from '@entities/setting.entity';
import { NavigationModule } from '../navigation/navigation.module';

@Module({
  imports: [TypeOrmModule.forFeature([Setting]), NavigationModule],
  controllers: [SettingsController],
  providers: [SettingsService, SettingsRevalidationService],
  exports: [SettingsService, SettingsRevalidationService],
})
export class SettingsModule {}
