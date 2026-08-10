import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameVersion } from '@entities/game-version.entity';
import { GameVersionBuild } from '@entities/game-version-build.entity';
import { GameVersionService } from './game-version.service';

@Module({
  imports: [TypeOrmModule.forFeature([GameVersion, GameVersionBuild])],
  providers: [GameVersionService],
  exports: [GameVersionService],
})
export class GameVersionsModule {}
