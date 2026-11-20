import { Module } from '@nestjs/common';
import { ResourceEmbedService } from './resource-embed.service';

/** 无状态批量水合服务，单独成模块以避免 Resources ↔ Posts 的模块环。 */
@Module({
  providers: [ResourceEmbedService],
  exports: [ResourceEmbedService],
})
export class ResourceEmbedModule {}
