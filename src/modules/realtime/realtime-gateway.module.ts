import { Module } from '@nestjs/common';
import { MultiplayerModule } from '../multiplayer/multiplayer.module';
import { RealtimeModule } from './realtime.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeV1Controller } from './realtime-v1.controller';

@Module({
  imports: [RealtimeModule, MultiplayerModule],
  controllers: [RealtimeV1Controller],
  providers: [RealtimeGateway],
})
export class RealtimeGatewayModule {}
