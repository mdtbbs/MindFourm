import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogsService } from './logs.service';
import { OperationLog, User } from '@entities/index';

@Module({
  imports: [TypeOrmModule.forFeature([OperationLog, User])],
  providers: [LogsService],
  exports: [LogsService],
})
export class LogsModule {}
