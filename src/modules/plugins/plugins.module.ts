import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plugin } from '@entities/plugin.entity';
import { PluginHook } from '@entities/plugin-hook.entity';
import { PluginConfig } from '@entities/plugin-config.entity';
import { PluginPermission } from '@entities/plugin-permission.entity';
import { PluginManagerService } from './plugin-manager.service';
import { EventBusService } from './event-bus.service';
import { PluginsController } from './plugins.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Plugin, PluginHook, PluginConfig, PluginPermission])],
  controllers: [PluginsController],
  providers: [EventBusService, PluginManagerService],
  exports: [EventBusService, PluginManagerService],
})
export class PluginsModule {}
