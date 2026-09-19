import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameVersion } from '@entities/game-version.entity';
import { GameVersionBuild } from '@entities/game-version-build.entity';
import { GameVersionService } from './game-version.service';
import { GameVersionsController } from './game-versions.controller';
import { MindustryManifestImportService } from './mindustry-manifest-import.service';

@Module({
  imports: [TypeOrmModule.forFeature([GameVersion, GameVersionBuild])],
  providers: [GameVersionService, MindustryManifestImportService],
  controllers: [GameVersionsController],
  exports: [GameVersionService],
})
export class GameVersionsModule {}
