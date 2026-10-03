import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OAuthScopeGuard } from '../../common/guards/oauth-scope.guard';
import { Resource } from '@entities/resource.entity';
import { ResourceCategory } from '@entities/resource-category.entity';
import { ResourceFile } from '@entities/resource-file.entity';
import { ResourcePackItem } from '@entities/resource-pack-item.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { ResourceVersionCompatibility } from '@entities/resource-version-compatibility.entity';
import { ResourceVersionDependency } from '@entities/resource-version-dependency.entity';
import { CapabilitiesModule } from '../capabilities/capabilities.module';
import { DownloadsModule } from '../downloads/downloads.module';
import { PackItemsController } from './pack-items.controller';
import { PacksController } from './packs.controller';
import { PacksService } from './packs.service';

@Module({
  imports: [
    CapabilitiesModule,
    DownloadsModule,
    TypeOrmModule.forFeature([
      Resource, ResourceCategory, ResourceFile, ResourcePackItem, ResourceVersion,
      ResourceVersionCompatibility, ResourceVersionDependency,
    ]),
  ],
  providers: [OAuthScopeGuard, PacksService],
  controllers: [PacksController, PackItemsController],
  exports: [PacksService],
})
export class PacksModule {}
