import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameServer } from '@entities/game-server.entity';
import { GameServerSnapshot } from '@entities/game-server-snapshot.entity';
import { GameServerService } from './game-server.service';

@Module({
  imports: [TypeOrmModule.forFeature([GameServer, GameServerSnapshot])],
  providers: [GameServerService],
  exports: [GameServerService],
})
export class GameServersModule {}
