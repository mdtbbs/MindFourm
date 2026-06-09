import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServersService } from './servers.service';
import { ServersController } from './servers.controller';

@Module({
  imports: [ConfigModule],
  controllers: [ServersController],
  providers: [ServersService],
})
export class ServersModule {}
