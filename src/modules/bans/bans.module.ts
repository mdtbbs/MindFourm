import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BansService } from './bans.service';
import { BansController } from './bans.controller';
import { Ban, User } from '@entities/index';

@Module({
  imports: [TypeOrmModule.forFeature([Ban, User])],
  controllers: [BansController],
  providers: [BansService],
  exports: [BansService],
})
export class BansModule {}
