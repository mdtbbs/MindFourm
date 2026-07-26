import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BansService } from './bans.service';
import { BansController } from './bans.controller';
import { Ban, User } from '@entities/index';

// Global so the app-level BanGuard and the auth guards can inject BansService
// without every feature module having to import this one.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Ban, User])],
  controllers: [BansController],
  providers: [BansService],
  exports: [BansService],
})
export class BansModule {}
