import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxEvent } from '@entities/outbox-event.entity';
import { EventsService } from './events.service';

@Module({
  imports: [TypeOrmModule.forFeature([OutboxEvent])],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
